# Onyx

> AI-native team collaboration platform — task decomposition, kanban, project wiki, sprint cycles, personal AI assistant, integrations, and real-time notifications.

## What is this

Onyx is an AI-native collaboration platform for teams. The core idea: **give AI a goal, it breaks it into assignable subtasks** — you review, edit, confirm, and tasks land on the kanban.

Beyond task management, each user gets a **personal AI assistant** (小T) with 26 tools, cosine-similarity tool search, parallel sub-agent spawning, project context, memory, and integrations across code, email, and group chat.

### Key Features

- **AI Task Decomposition** — describe a goal, AI splits it into subtasks with suggested owners and time estimates. Review and edit each subtask before accepting.
- **Kanban Board** — drag-and-drop task cards across status columns (todo → in_progress → blocked → review → done). Click to edit, delete, or generate AI implementation hints.
- **Personal AI Assistant** — per-user chat agent with 26 tools, cosine-similarity tool search (~8 tools per turn from 26), parallel sub-agent spawning (up to 3 concurrent), model selection, project context, memory, and skills.
- **Project Wiki/Pages** — markdown documents with tree hierarchy per project. AI assistant can create and update docs ("write a meeting summary").
- **Sprint Cycles** — time-boxed iterations. Add tasks, track progress, close with incomplete task review.
- **Saved Views** — personal task filter/sort presets for quick access to custom perspectives.
- **Progress Sharing** — project stats + active cycle progress + AI brief + recent docs + grouped clickable task flow.
- **Real-time Notifications** — SSE push for task changes, workspace edits, teammate messages, brief generation.
- **Enterprise SSO** — proxy authentication against enterprise accounts, auto-provisioning users.
- **Integrations** — GitLab, GitHub, Telegram group chat, DingTalk (skeleton), WeCom Mail (IMAP).
- **Telegram Group Chat** — bot webhook stores group messages; assistant can summarize recent chats and generate task suggestions for human confirmation.
- **Contribution Tracking** — MCP server + CLI for local AI agents (Claude Code, Codex, Cursor) to push structured work summaries.
- **3-Language i18n** — 简体中文 / 繁體中文 / English.

## Current Status

**In internal demo use.** Deployed at `https://onyxplat.top` via Cloudflare Tunnel, with local development on `http://localhost:3137`.

| Area | Status |
|---|---|
| Auth (JarvisBIM proxy + local password fallback) | ✅ |
| Projects (CRUD, archive, members, ACL, drag reorder, batch delete) | ✅ |
| Kanban (task cards, drag-and-drop, state machine, inline edit) | ✅ |
| AI Decomposition (goal → editable subtasks → confirm) | ✅ |
| Personal AI Assistant (chat, 26 tools, Pi sidecar, tool search, spawn_agent, model selector) | ✅ |
| Project Wiki/Pages (tree hierarchy, markdown, AI create/update) | ✅ |
| Sprint Cycles (time-boxed, task linkage, progress stats, close) | ✅ |
| Saved Views (personal filter presets) | ✅ |
| Progress Sharing (cycle banner, grouped task flow, AI brief, docs) | ✅ |
| Project Workspace (background/context/focus, optimistic lock) | ✅ |
| Notifications (6 triggers, SSE real-time push) | ✅ |
| Chat Sessions (multi-session, auto-title from first message) | ✅ |
| MCP Server + CLI (contribution ingest) | ✅ |
| PAT (scoped personal access tokens) | ✅ |
| Integrations (GitLab ✅, GitHub ✅, Telegram ✅, DingTalk 🔧, WeCom Mail ✅) | ✅ |
| Help page (in-app user guide) | ✅ |
| BYOK LLM keys (per-user API keys for other providers) | Planned |
| Report automation (scheduler) | Planned |
| Multi-tenant expansion | Pre-wired (tenant_id on all tables) |

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12 + FastAPI + SQLModel + Alembic |
| Agent Sidecar | Pi Agent Core (Node.js) — all LLM calls, agent loop, tool search, spawn_agent |
| Tool Bridge | Python `GET /internal/agent-tools` (25 tool schemas) → sidecar dynamic loading |
| LLM | DeepSeek V4 Flash (default) / V4 Pro (user-selectable) |
| Database | Postgres 16 (Docker) + Alembic migrations |
| Frontend | Vanilla JS ES modules (21 files, zero build tool) |
| Design | Slate+Gold theme (Inter font, #1a1a1a + #c8a951) |
| Deploy | systemd (`onyx.service` + `onyx-sidecar.service`) + nginx + Cloudflare Tunnel |
| Auth | Enterprise SSO + cookie sessions (7-day, httpOnly) |

## Getting Started

**Requirements:** conda (miniconda), Docker

```bash
# Setup
conda create -n team-platform python=3.12 -y
conda activate team-platform
pip install -e ".[dev]"
cp .env.example .env          # fill LLM_API_KEY + CRYPTO_KEY
docker compose up -d postgres
alembic upgrade head

# Sidecar setup (Node 22+)
cd sidecar && npm install && cd ..

# Run
make dev       # uvicorn --reload :3137
node sidecar/server.js  # Pi sidecar :3200 (separate terminal)
make test      # pytest
make lint      # ruff check + format
```

**Configuration (`.env`):**
- `LLM_API_KEY` — DeepSeek API key (required for AI features)
- `CRYPTO_KEY` — Fernet key for credential encryption (required)
- `ALLOWED_EMAIL_DOMAINS` — comma-separated domains for self-registration (empty = closed)

**Local access:** http://localhost:3137

**Demo access:** https://onyxplat.top

For production deployment, use systemd services (`onyx.service` + `onyx-sidecar.service`) behind nginx and Cloudflare Tunnel.

## Architecture

```
┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌─────────────────┐
│  Frontend    │   │  FastAPI     │   │  Pi Sidecar   │   │  Postgres 16    │
│  (21 ES     │──▶│  Monolith    │◀─▶│  (Node.js)    │   │  (all state)    │
│   modules)  │   │  :3137       │   │  :3200        │   │                 │
│             │   │              │   │               │   │  20+ tables     │
│  - Kanban   │   │  - REST API  │   │  - Agent loop │   │  - tasks/projects│
│  - Chat WS  │   │  - WebSocket │   │  - Tool search│   │  - pages/cycles │
│  - Pages    │   │  - SSE push  │   │  - spawn_agent│   │  - chat/notifs  │
│  - Cycles   │   │  - 25 tools  │   │  - /chat      │   │  - views/tokens │
│  - SSE      │   │  - tool bridge│  │  - /completion│   │  - workspaces   │
└─────────────┘   └──────────────┘   └───────────────┘   └─────────────────┘
                         │                    │
                         │  GET /internal/    │  LLM API
                         │  agent-tools ────▶ │ ────▶ DeepSeek
                         │  POST /internal/   │
                         │  agent-tools/{name} │
                         │◀────────────────── │

┌─────────────┐
│  MCP / CLI   │
│  (onyx-mcp)  │── scoped PAT ──▶ POST /me/contributions
└─────────────┘
```

### Design Principles

1. **AI suggests, doesn't execute** — all AI outputs go through `ai_suggestions` for human confirmation
2. **On-demand pull, not polling** — external data fetched only when needed
3. **Privacy floor** — PMs can't read others' chat; `llm_calls` stores metadata only
4. **Multi-tenant day 1** — every table has `tenant_id`, every query filters by it
5. **404 over 403** — don't leak resource existence to unauthorized callers
6. **Tool search by intent** — Pi sidecar uses cosine-similarity (CJK bigram + unigram + keyword-boosted) to select ~8 relevant tools per turn from 26 total
7. **Sidecar separation** — Pi (Node.js) owns all LLM calls and agent loop; Python owns business logic and tool execution. Communication via internal HTTP bridge.

## AI Assistant Tools (26, cosine-similarity tool search)

| Category | Tools |
|---|---|
| Tasks | query_my_tasks, query_team_tasks, query_project_tasks, update_task_status, create_task_suggestion, get/update_task_impl_hint |
| Projects | list_my_projects, get_project_members, update_project_workspace, decompose_into_project |
| Pages | create_page, update_page |
| Memory | remember, note_about_user, rewrite_memory |
| Skills | save_skill, improve_skill |
| Communication | notify_teammate, log_manual_work |
| Search | web_search, fetch_url |
| Email | query_my_emails |
| Group Chat | query_telegram_chats, summarize_group_chat |
| Agent | spawn_agent (sidecar-native, parallel child agents, sync+summary, depth=1) |

## CLI / MCP

The `onyx` CLI and `onyx-mcp` MCP server let local AI agents push work summaries:

```bash
export ONYX_URL=https://onyxplat.top
export ONYX_TOKEN=tp_xxx
onyx contribute "finished login callback" --project "My Project"
onyx projects
```

## Design Documents

- `docs/superpowers/specs/2026-06-05-views-pages-cycles-design.md` — Saved Views + Pages + Cycles design (rev 2)
- `docs/superpowers/specs/2026-05-28-contribution-and-progress-design.md` — Contribution + progress sharing
- `docs/superpowers/specs/2026-05-28-projects-redesign-design.md` — Projects redesign
- `docs/user-guide.md` — User-facing feature guide
- `docs/specs/team-platform-design.html` — Interactive design doc (ER diagrams, state machines)
- `frontend/docs/user-guide.md` — In-app help page

## License

[AGPL-3.0](LICENSE) — open source. Commercial license available for proprietary use. See [NOTICE](NOTICE) for details.
