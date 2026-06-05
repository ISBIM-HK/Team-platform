# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Repository status

**P0 ✅ · P1 core ✅ · parts of P2 landed · a new "contribution + progress sharing" line shipped.** Application code exists and runs (`make dev` on :3137). Snapshot below — trust the tree over this line, it drifts:

- **Backend skeleton (P0 ✅)** — FastAPI monolith (`src/api/app.py`, 12 routers under `/api/v1` + WS chat + health), `src/core/` (config, Fernet `crypto`, async `database`, cookie-session `security`), Postgres + Alembic (4 migrations in `src/migrations/versions/`), email+password auth, task CRUD + state machine.
- **AI engine (P1 core ✅)** — `src/ai/`: `decompose` (goal → subtasks + suggested owner + estimate), `dispatch` (assignment suggestions), `assistant` + `tools`, `brief` (project progress), `usage` (LLM cost → `llm_calls`). End-to-end path works: decompose → `ai_suggestions` → accept → parent+child tasks land.
- **Capture (P2 partial)** — `src/capture/gitlab.py` + `sync.py`, GitLab only, on-demand pull. Lark / DingTalk / Notion / mail / meetings not built.
- **Contribution + progress sharing (new, beyond the README's P0–P5 table)** — PAT auth (`/me/tokens`), `POST /me/contributions`, MCP server + `teamplat` CLI (`src/clients/`), AI brief sharing (`POST /projects/{id}/brief`). Design: `docs/superpowers/specs/2026-05-28-contribution-and-progress-design.md`.
- **Frontend** — bundled static SPA (`frontend/`, served same-origin): kanban, chat, projects, share tab.
- **Tests / CI** — `tests/unit/` + `tests/integration/` (ephemeral PG) + `tests/ai_eval/decompose/`; `.github/workflows/ci.yml`.
- **Not built yet** — report automation + scheduler (P3: `report`/`scheduled_job` models exist, but no generation route and no APScheduler module wired), non-GitLab adapters (P3/P4), SSO (P5). `tenant_id` is pre-wired on every table.

**This `AGENTS.md` is itself gitignored** (`.gitignore` line 6) — edits stay local, so keep it current for your own future sessions. Under `docs/specs/`, only `team-platform-design.html` + `assets/` are committed; the markdown specs there are gitignored (local-only). The two `docs/superpowers/specs/*.md` design docs ARE committed.

## Design docs — read these first

- `docs/specs/2026-05-27-team-platform-design.md` — core design (v0.1), still authoritative for the data model / domain rules. **Gitignored (local-only).**
- `docs/superpowers/specs/2026-05-28-projects-redesign-design.md` — adds the Project dimension + frontend IA (appendix G). **Committed.**
- `docs/superpowers/specs/2026-05-28-contribution-and-progress-design.md` — contribution ingest + progress sharing (privacy-first, MCP-first). **Committed.**
- `docs/specs/team-platform-design.html` — interactive view of the core design (committed; ER diagram / state machines).
- `docs/specs/2026-05-27-original-gemini-crewai-plan.md` — **superseded**. A prior CrewAI/4-agent plan the current design rejects. Do not reuse its architecture. (Gitignored.)

The specs are in Chinese; respond in the language the user uses (Chinese ↔ English).

## Architecture at a glance

A single-process FastAPI monolith with "B-ready discipline" — designed today to split into a distributed event-driven system later, without rewriting the data model or API contract. Key shape:

- **Backend**: Python 3.12 + FastAPI + SQLModel + Alembic
- **Agent layer**: PydanticAI (structured outputs, type-safe). *Not* CrewAI — the original plan's multi-agent-as-multi-process design was rejected as wrong-direction.
- **LLM tiering**: **DeepSeek** (see `src/core/config.py`) — `deepseek-v4-flash` (cheap, high-volume narrow tasks: normalization/extraction) and `deepseek-v4-pro` (strong, reasoning/writing: decompose/dispatch/reports/assistant). Configurable + hot-swappable via `llm_model_cheap` / `llm_model_strong`. (Design originally specced Haiku/Sonnet; the project switched to DeepSeek.)
- **DB**: Postgres 16 in docker from day 1 (no SQLite — avoid future migration surgery).
- **Deploy**: docker compose with three containers — `app` (FastAPI + bundled static frontend), `postgres`, `caddy` (auto TLS).
- **Auth**: OIDC SSO preferred (P5), email+password fallback (P0). Cookie sessions (httpOnly + SameSite=Lax), not JWT.

### Load-bearing design rules

These are non-obvious from any single file and must be preserved across changes:

1. **On-demand pull, not continuous polling.** Captures from GitLab / Lark / DingTalk / Notion / mail / meetings fire only when a user action or scheduled report needs them. A 5-min in-memory cache deduplicates same-window requests. No background pollers.
2. **AI suggests, doesn't execute.** Every AI output that would mutate state writes to `ai_suggestions` (with `rationale`, `confidence`, `based_on_events`) and waits for human accept/reject. Six-month observation period before any auto-execution channel is considered.
3. **Multi-tenant on day 1.** Every table carries `tenant_id`; every query/write enforces it. MVP has one tenant, but the column exists so expansion is not a schema migration.
4. **`events_cache` is append-only with TTL 90d.** `UNIQUE (source, external_id)` dedupes repeated pulls. `payload JSONB` keeps the raw adapter output so schema evolution doesn't break old rows. This table is the seed for the future NATS JetStream stream (`{tenant}.{source}.{event_type}` subject mapping).
5. **Privacy floor.** PMs cannot read others' chat content — `chat_sessions` / `chat_messages` are owner-only at the API layer. `llm_calls` records *metadata only* (model / tokens / cost / latency), never prompt/response text. Don't log content to files either; use `LOG_LEVEL=DEBUG` only when consciously debugging.
6. **Credentials are Fernet-encrypted at rest.** `integrations.credential` is encrypted with `CRYPTO_KEY` from env (never in DB or repo). Startup must fail-fast if `CRYPTO_KEY` is missing. Two-key rotation supported.
7. **B-ready discipline (from §8.4).** All capture adapters implement one ABC (`CaptureAdapter`). AI processing functions are *pure* (events in, structured result out). DB access goes through a repository layer. Sessions don't rely on process memory (interface even if backed by in-memory dict today). Config-driven (`config.yaml`) so models/thresholds/integrations can change without code edits.
8. **404 over 403** when a resource is hidden from the caller — don't leak existence.
9. **UUID v7** for all primary keys (sortable, time-ordered).

### Capture adapter contract (design target — `src/capture/base.py`, NOT yet implemented)

The design's B-ready target: all sources implement one ABC (`authenticate`, `fetch(user_id, since, cursor) -> AsyncIterator[RawEvent]`, `get_next_cursor`, optional `register_webhook`); `RawEvent` is `{event_type, external_id, occurred_at, actor_external_id, payload}`; a central `EventNormalizer` maps `actor_external_id` → `users.id` and writes `events_cache`.

**Current reality:** no `base.py`, no `CaptureAdapter` ABC, no `RawEvent` class yet. The only adapter — GitLab — is plain module functions: `src/capture/gitlab.py` (`fetch_events`, `map_event_type`, `parse_occurred_at`) + `src/capture/sync.py` (`sync_gitlab` → normalize → `events_cache`, with 3-consecutive-failure auto-disable). When adding a second source, either introduce the ABC and refactor GitLab onto it, or flag the divergence. Manual logging (`log_manual_work`, `source='user_chat'`/`agent`) remains the catch-all for work integrations can't see.

### AI processing layer

Not a daemon — a set of pure functions invoked at well-defined trigger points (report cron, kanban-load, assistant turn). Output schemas live in PydanticAI `result_type` models (`ActivityItem`, `DailyReport`, `TaskSuggestion`, `AssignmentSuggestion`, ...). Every call records to `llm_calls` for cost auditing. Budgets:
- Per-user daily token budget enforced in code (default 200k tokens/day).
- Monthly hard cap (`MONTHLY_HARD_CAP_USD`) pauses non-critical AI when hit; personal assistant stays up.
- On budget pressure, degrade Sonnet → Haiku before stopping.

### Phasing — do not skip ahead

`README.md` lists P0 → P5. Each phase has a "completion definition" (§9.2) that must hold before moving on. When the user asks for a feature, **place it in the right phase first** — many feature requests belong to a later phase and should be deferred, not implemented now. Notable deferrals in §9.3: custom RBAC, Gantt/burndown, customer tickets, mobile app, multi-language, AI auto-execution, cross-tenant, billing.

## Commands

The `Makefile` is live (conda-based — env name `team-platform`, **not** uv):

```
make setup     # conda pip install -e ".[dev]" + docker compose up postgres + alembic upgrade head
make dev       # uvicorn src.api.app:app --reload --host 0.0.0.0 --port 3137
make test      # pytest -v
make migrate name=add_xxx   # alembic revision --autogenerate + upgrade head
make lint      # ruff check + ruff format --check (src/ tests/)
make docker-up / make docker-down   # full docker compose stack (app + postgres + caddy)
```

Runtime needs: conda env `team-platform`, a running Postgres (`docker compose up -d postgres`), and `.env` with `LLM_API_KEY` (DeepSeek) + `CRYPTO_KEY` (startup fail-fasts without it); set `ALLOWED_EMAIL_DOMAINS` to enable self-registration. App + Swagger at http://localhost:3137 (`/docs`).

Testing layers (from §10) when implemented:
- `tests/unit/` — pure-function tests (models, permissions, business rules), millisecond-level, no I/O.
- `tests/integration/` — DB + adapter (`vcrpy` recorded) + API (`httpx.AsyncClient`); uses ephemeral PG container.
- `tests/e2e/` — Playwright, ≤10 critical flows, main branch only.
- `tests/ai_eval/` — YAML cases under `tests/ai_eval/<task>/cases/`, LLM-as-judge for fuzzy assertions, hard assertions for counts/categories. **The `runs/` subdir is gitignored** (see `.gitignore`). Weekly cron + on prompt change.

## Frontend handoff

A teammate owns the frontend (framework TBD). The contract between us is **OpenAPI 3.1** auto-generated by FastAPI at `/openapi.json`, exported to `openapi.yaml` in-repo, with TS types generated via `openapi-typescript`. Any API change must update the spec in the same PR — front-end is built against the spec, not against running code. Mock server: `prism mock openapi.yaml`.

## Things to flag, not silently fix

- A schema change that drops or renames a column (§7.5 forbids breaking migrations — must be add-column → dual-write → drop-old, across releases).
- Anything that would persist LLM prompt/response content outside `chat_messages` (e.g., into `llm_calls`, logs, or audit tables).
- Code that adds a query without `tenant_id` filtering, or a table without a `tenant_id` column.
- Background pollers — if you find yourself adding one, re-read §2.1; the design rejects them.
- AI code paths that mutate kanban/tasks directly instead of writing `ai_suggestions`.
