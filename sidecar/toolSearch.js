/**
 * Tool search — vector retrieval for selecting relevant tools per user message.
 *
 * Uses character bigram + word token vectors with cosine similarity.
 * Handles Chinese and English natively, no external model required.
 * Swap in neural embeddings later by replacing tokenize() + similarity().
 */

// Default tools always included (core functionality)
const ALWAYS_INCLUDE = new Set(["query_my_tasks", "list_my_projects"]);

// CJK Unicode range test
const CJK_RE = /[一-鿿㐀-䶿]/;

/**
 * Tokenize text into character unigrams + bigrams + word tokens.
 * Unigrams catch single-character Chinese matches (搜→搜索).
 * Bigrams catch two-character compounds (任务, 邮件).
 * Word tokens handle English and multi-char Chinese words.
 */
function tokenize(text) {
  const tokens = new Map(); // token -> count
  const cleaned = text.toLowerCase();

  // Word-level tokens (split on punctuation/whitespace)
  const words = cleaned.split(/[\s,，。！？、；：""''（）()\[\]{}\/\\|·—\-_:：.。]+/);
  for (const w of words) {
    if (w.length > 0) {
      tokens.set(w, (tokens.get(w) || 0) + 1);
    }
  }

  // Character-level: unigrams for CJK, bigrams for all
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (CJK_RE.test(ch)) {
      tokens.set(ch, (tokens.get(ch) || 0) + 1);
    }
    if (i < cleaned.length - 1) {
      const bg = cleaned.slice(i, i + 2);
      if (!/\s/.test(bg)) {
        tokens.set(bg, (tokens.get(bg) || 0) + 1);
      }
    }
  }

  return tokens;
}

/**
 * Cosine similarity between two token frequency maps.
 */
function cosineSim(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [token, countA] of a) {
    normA += countA * countA;
    const countB = b.get(token) || 0;
    dot += countA * countB;
  }
  for (const [, countB] of b) {
    normB += countB * countB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Build a search index from loaded tools.
 * Call once after tools are loaded from Python.
 * Tool name keywords are boosted (counted 3x) for stronger matching.
 */
export function buildIndex(tools) {
  return tools.map((tool) => {
    const nameWords = tool.name.replace(/_/g, " ");
    const keywords = (tool.keywords || []).join(" ");
    const kw5 = `${keywords} `.repeat(5).trim();
    const text = `${nameWords} ${nameWords} ${nameWords} ${kw5} ${tool.description || ""}`;
    return { tool, tokens: tokenize(text) };
  });
}

/**
 * Select the most relevant tools for a user message.
 *
 * @param {string} query - User message
 * @param {Array} index - Output of buildIndex()
 * @param {number} topK - Max tools to return (default 8)
 * @param {number} minScore - Minimum similarity threshold (default 0.05)
 * @returns {Array} Selected tools, always includes ALWAYS_INCLUDE set
 */
export function selectTools(query, index, topK = 8, minScore = 0.02) {
  const queryTokens = tokenize(query);

  const scored = index.map(({ tool, tokens }) => ({
    tool,
    score: cosineSim(queryTokens, tokens),
    isDefault: ALWAYS_INCLUDE.has(tool.name),
  }));

  // Always-include tools go first, then by score
  scored.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return b.score - a.score;
  });

  const selected = [];
  for (const s of scored) {
    if (selected.length >= topK && !s.isDefault) break;
    if (s.score >= minScore || s.isDefault) {
      selected.push(s.tool);
    }
  }

  // If nothing matched, return defaults only
  if (selected.length === 0) {
    return scored.filter((s) => s.isDefault).map((s) => s.tool);
  }

  return selected;
}
