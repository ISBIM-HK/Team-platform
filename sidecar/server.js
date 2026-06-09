import http from "node:http";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel, streamSimple } from "@earendil-works/pi-ai";
import { buildIndex, selectTools } from "./toolSearch.js";

const ONYX_API = process.env.ONYX_API_URL || "http://localhost:3137";
const PORT = parseInt(process.env.SIDECAR_PORT || "3200", 10);
const DEEPSEEK_API_KEY = process.env.LLM_API_KEY || "";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

// --- Tool bridge: call Python FastAPI internal endpoints ---

async function callPythonTool(toolName, args, meta) {
  const res = await fetch(`${ONYX_API}/api/v1/internal/agent-tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify({ args, meta }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: true, content: `Tool ${toolName} failed: ${res.status} ${text}` };
  }
  return res.json();
}

let _activeMeta = {};

// --- Dynamic tool loading from Python ---

function makeBridgeTool(name, description, parameters) {
  return {
    name,
    description,
    parameters,
    execute: async (_toolCallId, params) => {
      const result = await callPythonTool(name, params, _activeMeta);
      if (result.error) {
        return {
          content: [{ type: "text", text: result.content || "Tool execution failed" }],
          details: { error: true },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: typeof result.data === "string" ? result.data : JSON.stringify(result.data) }],
        details: result.details || {},
      };
    },
  };
}

function convertOpenAIToPiTool(schema) {
  const fn = schema.function;
  const props = fn.parameters?.properties || {};
  const piParams = {};
  for (const [key, val] of Object.entries(props)) {
    piParams[key] = { type: val.type || "string", description: val.description || "" };
    if (val.default !== undefined) piParams[key].default = val.default;
  }
  const tool = makeBridgeTool(fn.name, fn.description || fn.name, { type: "object", properties: piParams });
  if (fn.keywords) tool.keywords = fn.keywords;
  return tool;
}

let TOOLS = [];
let TOOL_INDEX = [];
let BASE_SYSTEM_PROMPT = "";

async function loadToolsFromPython() {
  try {
    const res = await fetch(`${ONYX_API}/api/v1/internal/agent-tools`, {
      headers: { "X-Internal-Secret": INTERNAL_SECRET },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    TOOLS = (data.tools || []).map(convertOpenAIToPiTool);
    TOOL_INDEX = buildIndex(TOOLS);
    BASE_SYSTEM_PROMPT = data.system_prompt || "";
    console.log(`[sidecar] loaded ${TOOLS.length} tools, index built`);
  } catch (e) {
    console.error(`[sidecar] failed to load tools: ${e.message}`);
    console.error("[sidecar] starting with 0 tools — will retry on first request");
  }
}

// --- Agent factory ---

function createAgent(model, systemPrompt, tools, apiKey) {
  return new Agent({
    initialState: { systemPrompt, model, tools },
    streamFn: streamSimple,
    getApiKey: (provider) => {
      if (provider === "deepseek") return apiKey || DEEPSEEK_API_KEY;
      return process.env[`${provider.toUpperCase()}_API_KEY`] || "";
    },
    beforeToolCall: async (ctx) => {
      console.log(`[tool] ${ctx.toolCall.name}(${JSON.stringify(ctx.args).slice(0, 200)})`);
      return undefined;
    },
  });
}

function resolveModel(provider, modelId) {
  return getModel(provider || "deepseek", modelId || "deepseek-v4-flash");
}

// --- HTTP helpers ---

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// --- HTTP server ---

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Health
  if (req.url === "/health" && req.method === "GET") {
    return sendJson(res, 200, { status: "ok", service: "onyx-agent-sidecar", tools: TOOLS.length });
  }

  // Reload tools
  if (req.url === "/reload-tools" && req.method === "POST") {
    await loadToolsFromPython();
    return sendJson(res, 200, { tools: TOOLS.length });
  }

  // Chat turn (non-streaming) — full agent loop with tools
  if (req.url === "/chat" && req.method === "POST") {
    try {
      if (TOOLS.length === 0) await loadToolsFromPython();

      const body = await readBody(req);
      const { message, history, system_prompt, model_id, provider, api_key, user_id, tenant_id, project_id } = body;

      _activeMeta = { user_id: user_id || "", tenant_id: tenant_id || "", project_id: project_id || "" };

      // Tool search: select relevant tools for this message
      const selected = TOOL_INDEX.length > 0 ? selectTools(message, TOOL_INDEX) : TOOLS;
      console.log(`[tool-search] "${message.slice(0, 30)}..." → ${selected.map(t => t.name).join(", ")} (${selected.length}/${TOOLS.length})`);

      const model = resolveModel(provider, model_id);
      const prompt = system_prompt || BASE_SYSTEM_PROMPT || "你是小T，Onyx 平台的 AI 工作助手。";
      const agent = createAgent(model, prompt, selected, api_key);

      if (history && history.length > 0) {
        agent.state.messages = history.map((m) => ({
          role: m.role,
          content: [{ type: "text", text: m.content }],
          timestamp: Date.now(),
        }));
      }

      let fullText = "";
      const unsub = agent.subscribe((event) => {
        if (event.type === "message_update" && event.message?.content) {
          fullText = event.message.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("");
        }
      });

      await agent.prompt(message);
      await agent.waitForIdle();
      unsub();

      return sendJson(res, 200, { reply: fullText, model: model_id, provider });
    } catch (e) {
      console.error("[chat error]", e);
      return sendJson(res, 500, { error: e.message });
    }
  }

  // SSE streaming chat
  if (req.url === "/chat/stream" && req.method === "POST") {
    try {
      if (TOOLS.length === 0) await loadToolsFromPython();

      const body = await readBody(req);
      const { message, history, system_prompt, model_id, provider, api_key, user_id, tenant_id, project_id } = body;

      _activeMeta = { user_id: user_id || "", tenant_id: tenant_id || "", project_id: project_id || "" };

      const selected = TOOL_INDEX.length > 0 ? selectTools(message, TOOL_INDEX) : TOOLS;

      const model = resolveModel(provider, model_id);
      const prompt = system_prompt || BASE_SYSTEM_PROMPT || "你是小T，Onyx 平台的 AI 工作助手。";
      const agent = createAgent(model, prompt, selected, api_key);

      if (history && history.length > 0) {
        agent.state.messages = history.map((m) => ({
          role: m.role,
          content: [{ type: "text", text: m.content }],
          timestamp: Date.now(),
        }));
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const unsub = agent.subscribe((event) => {
        if (event.type === "message_update") {
          const ame = event.assistantMessageEvent;
          if (ame?.type === "text_delta") {
            res.write(`data: ${JSON.stringify({ type: "delta", text: ame.delta })}\n\n`);
          }
        } else if (event.type === "tool_execution_start") {
          res.write(`data: ${JSON.stringify({ type: "tool_start", name: event.toolName })}\n\n`);
        } else if (event.type === "tool_execution_end") {
          res.write(`data: ${JSON.stringify({ type: "tool_end", name: event.toolName })}\n\n`);
        } else if (event.type === "agent_end") {
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        }
      });

      await agent.prompt(message);
      await agent.waitForIdle();
      unsub();
      res.end();
    } catch (e) {
      console.error("[stream error]", e);
      res.write(`data: ${JSON.stringify({ type: "error", message: e.message })}\n\n`);
      res.end();
    }
    return;
  }

  // Simple completion (no tools) — for structured output / decompose / brief etc.
  if (req.url === "/completion" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { messages, model_id, provider, api_key, response_format } = body;

      const model = resolveModel(provider, model_id);
      const agent = createAgent(model, "", [], api_key);

      // Build the prompt from messages array
      const systemMsgs = messages.filter((m) => m.role === "system");
      const userMsgs = messages.filter((m) => m.role !== "system");

      if (systemMsgs.length > 0) {
        agent.state.systemPrompt = systemMsgs.map((m) => m.content).join("\n\n");
      }

      const userPrompt = userMsgs.map((m) => m.content).join("\n\n");

      let fullText = "";
      const unsub = agent.subscribe((event) => {
        if (event.type === "message_update" && event.message?.content) {
          fullText = event.message.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("");
        }
      });

      await agent.prompt(userPrompt);
      await agent.waitForIdle();
      unsub();

      return sendJson(res, 200, { content: fullText, model: model_id, provider });
    } catch (e) {
      console.error("[completion error]", e);
      return sendJson(res, 500, { error: e.message });
    }
  }

  // Debug: test tool search
  if (req.url === "/tool-search" && req.method === "POST") {
    const body = await readBody(req);
    const selected = selectTools(body.query || "", TOOL_INDEX, body.top_k || 8);
    return sendJson(res, 200, {
      query: body.query,
      selected: selected.map((t) => t.name),
      total: TOOLS.length,
    });
  }

  // List available models
  if (req.url === "/models" && req.method === "GET") {
    return sendJson(res, 200, {
      providers: ["deepseek", "openai", "anthropic"],
      defaults: { provider: "deepseek", model: "deepseek-v4-flash" },
    });
  }

  sendJson(res, 404, { error: "Not found" });
});

// --- Startup ---

server.listen(PORT, async () => {
  console.log(`[sidecar] listening on :${PORT}`);
  console.log(`[sidecar] Python API: ${ONYX_API}`);
  console.log(`[sidecar] DeepSeek key: ${DEEPSEEK_API_KEY ? "configured" : "MISSING"}`);
  await loadToolsFromPython();
});
