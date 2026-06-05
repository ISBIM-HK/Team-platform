# Team Platform

> AI-native team collaboration platform for BIM teams — task decomposition, kanban, project wiki, sprint cycles, personal AI assistant, and real-time notifications.

## What is this

A collaboration platform built for BIM (Building Information Modeling) teams. The core idea: **give AI a goal, it breaks it into assignable subtasks** — you review, edit, confirm, and tasks land on the kanban. Team members pull what they can.

Beyond task management, each user gets a **personal AI assistant** (小T) with 23 tools that can search the web, update tasks, write project documents, send messages to teammates, and remember context across sessions.

### Key Features

- **AI Task Decomposition** — describe a goal, AI splits it into subtasks with suggested owners and time estimates. Review and edit each subtask before accepting.
- **Kanban Board** — drag-and-drop task cards across status columns (todo → in_progress → blocked → review → done). Click to edit, delete, or generate AI implementation hints.
- **Personal AI Assistant** — per-user chat agent with 23 tools. Supports model selection (DeepSeek Flash/Pro). Persona, memory, and skills are customizable per user.
- **Project Wiki/Pages** — markdown documents with tree hierarchy per project. AI assistant can create and update docs ("write a meeting summary").
- **Sprint Cycles** — time-boxed iterations (方案 → 初设 → 施工图 → 竣工). Add tasks, track progress, close with incomplete task review.
- **Saved Views** — personal task filter/sort presets for quick access to custom perspectives.
- **Progress Sharing** — project stats + active cycle progress + AI brief + recent docs + grouped clickable task flow.
- **Real-time Notifications** — SSE push for task changes, workspace edits, teammate messages, brief generation.
- **JarvisBIM SSO** — proxy authentication against JarvisBIM enterprise accounts, auto-provisioning users.
- **Integrations** — GitLab, GitHub, DingTalk (skeleton), WeCom Mail (IMAP).
- **Contribution Tracking** — MCP server + CLI for local AI agents (Claude Code, Codex, Cursor) to push work summaries.
- **3-Language i18n** — 简体中文 / 繁體中文 / English.

## Current Status

**In use by team.** 4 users, running on `localhost:3137` with WSL port forwarding.

| Area | Status |
|---|---|
| Auth (JarvisBIM proxy + local password fallback) | ✅ |
| Projects (CRUD, archive, members, ACL, drag reorder, batch delete) | ✅ |
| Kanban (task cards, drag-and-drop, state machine, inline edit) | ✅ |
| AI Decomposition (goal → editable subtasks → confirm) | ✅ |
| Personal AI Assistant (chat, 23 tools, model selector, project context) | ✅ |
| Project Wiki/Pages (tree hierarchy, markdown, AI create/update) | ✅ |
| Sprint Cycles (time-boxed, task linkage, progress stats, close) | ✅ |
| Saved Views (personal filter presets) | ✅ |
| Progress Sharing (cycle banner, grouped task flow, AI brief, docs) | ✅ |
| Project Workspace (background/context/focus, optimistic lock) | ✅ |
| Notifications (6 triggers, SSE real-time push) | ✅ |
| Chat Sessions (multi-session, auto-title from first message) | ✅ |
| MCP Server + CLI (contribution ingest) | ✅ |
| PAT (scoped personal access tokens) | ✅ |
| Integrations (GitLab ✅, GitHub ✅, DingTalk 🔧, WeCom Mail ✅) | ✅ |
| Help page (in-app user guide) | ✅ |
| BYOK LLM keys (per-user API keys for other providers) | Planned |
| Report automation (scheduler) | Planned |
| Multi-tenant expansion | Pre-wired (tenant_id on all tables) |

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12 + FastAPI + SQLModel + Alembic |
| AI Agent | PydanticAI (structured outputs, 23 tool functions) |
| LLM | DeepSeek V4 Flash (default) / V4 Pro (user-selectable) |
| Database | Postgres 16 (Docker), 7 migrations |
| Frontend | Vanilla JS ES modules (21 files, zero build tool) |
| Design | Slate+Gold theme (Inter font, #1a1a1a + #c8a951) |
| Deploy | docker compose (app + postgres + caddy) |
| Auth | JarvisBIM proxy SSO + cookie sessions (7-day, httpOnly) |

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

# Run
make dev       # uvicorn --reload :3137
make test      # pytest
make lint      # ruff check + format
```

**Configuration (`.env`):**
- `LLM_API_KEY` — DeepSeek API key (required for AI features)
- `CRYPTO_KEY` — Fernet key for credential encryption (required)
- `ALLOWED_EMAIL_DOMAINS` — comma-separated domains for self-registration (empty = closed)

**Access:** http://localhost:3137 → click "企业账号登录 (SSO)" → enter JarvisBIM credentials

## Architecture

```
┌─────────────┐   ┌──────────────┐   ┌─────────────────┐
│  Frontend    │   │  FastAPI     │   │  Postgres 16    │
│  (21 ES     │──▶│  Monolith    │──▶│  (all state)    │
│   modules)  │   │  (14 routers)│   │                 │
│             │   │              │   │  20+ tables     │
│  - Kanban   │   │  - REST API  │   │  - tasks/projects│
│  - Chat WS  │   │  - WebSocket │   │  - pages/cycles │
│  - Pages    │   │  - SSE push  │   │  - chat/notifs  │
│  - Cycles   │   │  - PydanticAI│   │  - views/tokens │
│  - SSE      │   │  - 23 tools  │   │  - workspaces   │
└─────────────┘   └──────────────┘   └─────────────────┘

┌─────────────┐
│  MCP Server  │
│  (local CLI) │── PAT auth ──▶ POST /me/contributions
└─────────────┘
```

### Design Principles

1. **AI suggests, doesn't execute** — all AI outputs go through `ai_suggestions` for human confirmation
2. **On-demand pull, not polling** — external data fetched only when needed
3. **Privacy floor** — PMs can't read others' chat; `llm_calls` stores metadata only
4. **Multi-tenant day 1** — every table has `tenant_id`, every query filters by it
5. **404 over 403** — don't leak resource existence to unauthorized callers

## AI Assistant Tools (23)

| Category | Tools |
|---|---|
| Tasks | query_my_tasks, query_team_tasks, query_project_tasks, update_task_status, create_task_suggestion, get/update_task_impl_hint |
| Projects | list_my_projects, get_project_members, update_project_workspace, decompose_into_project |
| Pages | create_page, update_page |
| Memory | remember, note_about_user, rewrite_memory |
| Skills | save_skill, improve_skill |
| Communication | notify_teammate, log_manual_work |
| External | web_search, fetch_url |

## Design Documents

- `docs/superpowers/specs/2026-06-05-views-pages-cycles-design.md` — Saved Views + Pages + Cycles design (rev 2)
- `docs/superpowers/specs/2026-05-28-contribution-and-progress-design.md` — Contribution + progress sharing
- `docs/superpowers/specs/2026-05-28-projects-redesign-design.md` — Projects redesign
- `docs/user-guide.md` — User-facing feature guide
- `docs/specs/team-platform-design.html` — Interactive design doc (ER diagrams, state machines)

## License

[AGPL-3.0](LICENSE) — open source. Commercial license available for proprietary use. See [NOTICE](NOTICE) for details.
