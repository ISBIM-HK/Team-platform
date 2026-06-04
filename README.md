# Team Platform

> AI-native team collaboration platform for BIM teams — task decomposition, kanban, personal AI assistant, and real-time notifications.

## What is this

A collaboration platform built for BIM (Building Information Modeling) teams. The core idea: **give AI a goal, it breaks it into assignable subtasks** — you confirm, tasks land on the kanban, team members pull what they can.

Beyond task management, each user gets a **personal AI assistant** (小T) that can search the web, update task status, send messages to teammates, remember context across sessions, and inject project-level shared knowledge into every conversation.

### Key Features

- **AI Task Decomposition** — describe a goal, AI splits it into subtasks with suggested owners and time estimates
- **Kanban Board** — drag-and-drop task cards across status columns (todo → in_progress → review → done)
- **Personal AI Assistant** — per-user chat agent with 20+ tools (task management, web search, teammate messaging, memory, skills)
- **Project Workspaces** — shared project context (background, current focus) visible to the AI assistant
- **Real-time Notifications** — SSE push for task changes, workspace edits, teammate messages, brief generation
- **JarvisBIM SSO** — proxy authentication against JarvisBIM enterprise accounts, auto-provisioning users
- **Contribution Tracking** — MCP server + CLI for local AI agents (Claude Code, Codex, Cursor) to push work summaries

## Current Status

**Demo-ready.** Core features implemented and running on `localhost:3137`.

| Area | Status |
|---|---|
| Auth (JarvisBIM proxy + local password fallback) | ✅ |
| Projects (CRUD, archive, members, ACL) | ✅ |
| Kanban (task cards, drag-and-drop, state machine) | ✅ |
| AI Decomposition (goal → subtasks → suggestions → confirm) | ✅ |
| Personal AI Assistant (chat, 20+ tools, project context) | ✅ |
| Project Workspace (background/context/focus, optimistic lock) | ✅ |
| Notifications (6 triggers, SSE real-time push) | ✅ |
| Chat Sessions (multi-session, project-linked, auto-title) | ✅ |
| MCP Server + CLI (contribution ingest) | ✅ |
| PAT (scoped personal access tokens) | ✅ |
| Report automation (scheduler) | Planned |
| Non-GitLab integrations (Lark, DingTalk, Notion) | Planned |
| Multi-tenant expansion | Pre-wired (tenant_id on all tables) |

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12 + FastAPI + SQLModel + Alembic |
| AI Agent | PydanticAI (structured outputs, tool calling) |
| LLM | DeepSeek V4 Pro (assistant) + V4 Flash (batch tasks) |
| Database | Postgres 16 (Docker) |
| Frontend | Vanilla JS SPA (single `app.js` + `styles.css`) |
| Design | Notion-inspired warm workspace (Inter font, purple accent) |
| Deploy | docker compose (app + postgres + caddy) |
| Auth | JarvisBIM proxy SSO + cookie sessions |

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
│  (SPA)       │──▶│  Monolith    │──▶│  (all state)    │
│              │   │              │   │                 │
│  - Kanban    │   │  - REST API  │   │  - users        │
│  - Chat WS   │   │  - WebSocket │   │  - projects     │
│  - SSE notif │   │  - SSE push  │   │  - tasks        │
│              │   │  - PydanticAI│   │  - chat         │
└─────────────┘   └──────────────┘   │  - notifications│
                                      │  - workspaces   │
┌─────────────┐                       └─────────────────┘
│  MCP Server  │
│  (local CLI) │── PAT auth ──▶ POST /me/contributions
└─────────────┘
```

### Design Principles

1. **AI suggests, doesn't execute** — all AI outputs go through `ai_suggestions` for human confirmation (except task status updates and workspace edits by authorized users)
2. **On-demand pull, not polling** — external data fetched only when needed, 5-min cache dedup
3. **Privacy floor** — PMs can't read others' chat; `llm_calls` stores metadata only, never prompt/response text
4. **Multi-tenant day 1** — every table has `tenant_id`, every query filters by it
5. **404 over 403** — don't leak resource existence to unauthorized callers

## AI Assistant Tools

The personal assistant (小T) has 21 tools:

| Category | Tools |
|---|---|
| Tasks | query_my_tasks, query_team_tasks, query_project_tasks, update_task_status, create_task_suggestion, get/update_task_impl_hint |
| Projects | list_my_projects, get_project_members, update_project_workspace, decompose_into_project |
| Memory | remember, note_about_user, rewrite_memory |
| Skills | save_skill, improve_skill |
| Communication | notify_teammate, log_manual_work |
| External | web_search, fetch_url |

## Design Documents

- `docs/specs/team-platform-design.html` — interactive design doc (ER diagrams, state machines)
- `docs/superpowers/specs/` — contribution + progress sharing design, projects redesign

## License

[AGPL-3.0](LICENSE) — open source. Commercial license available for proprietary use. See [NOTICE](NOTICE) for details.
