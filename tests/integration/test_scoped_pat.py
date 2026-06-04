"""Scoped PAT — scope enforcement, anti-escalation, backward compat (2026-06-03)."""

from src.core.security import generate_pat
from src.models.pat import PersonalAccessToken
from src.repositories.user_repo import UserRepository


async def _register_login(client, email, pw="pw12345678", name="U"):
    await client.post("/api/v1/auth/register", json={"email": email, "display_name": name, "password": pw})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text


async def _create_scoped_token(session, user, scopes):
    raw, token_hash = generate_pat()
    pat = PersonalAccessToken(
        tenant_id=user.tenant_id,
        user_id=user.id,
        name="test-token",
        token_hash=token_hash,
        scopes=scopes,
    )
    session.add(pat)
    await session.flush()
    return raw


async def _get_user(session, email):
    return await UserRepository(session).get_by_email(email)


# ─── 1. Create scoped token returns scopes ───
async def test_create_scoped_token_returns_scopes(client):
    await _register_login(client, "admin@example.com")
    r = await client.post(
        "/api/v1/me/tokens",
        json={"name": "local-agent", "scopes": ["contributions:write", "projects:read"]},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert set(data["scopes"]) == {"contributions:write", "projects:read"}
    assert data["token"].startswith("pat_")


# ─── 2. Scoped token can POST contributions (scope matches) ───
async def test_scoped_token_can_contribute(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["contributions:write", "projects:read"])
    r = await client.post(
        "/api/v1/me/contributions",
        json={"summary": "from scoped token"},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert r.status_code == 201, r.text


# ─── 3. Scoped token can GET projects (scope matches) ───
async def test_scoped_token_can_read_projects(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["projects:read"])
    r = await client.get("/api/v1/projects", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 200, r.text


# ─── 4. Scoped token CANNOT PATCH tasks (missing tasks:write) ───
async def test_scoped_token_blocked_from_tasks_write(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["contributions:write"])
    r = await client.post(
        "/api/v1/tasks",
        json={"title": "nope", "project_id": "00000000-0000-0000-0000-000000000000"},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert r.status_code == 403, r.text
    assert "scope" in r.json()["detail"].lower()


# ─── 5. Scoped token CANNOT DELETE projects (missing projects:write) ───
async def test_scoped_token_blocked_from_project_delete(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["projects:read"])
    r = await client.delete(
        "/api/v1/projects/00000000-0000-0000-0000-000000000000",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert r.status_code == 403


# ─── 6. Scoped token CANNOT read chat (missing chat:read) ───
async def test_scoped_token_blocked_from_chat(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["contributions:write"])
    r = await client.get("/api/v1/chat/sessions", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 403


# ─── 7. Scoped token CANNOT read assistant (missing assistant:read) ───
async def test_scoped_token_blocked_from_assistant(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["contributions:write"])
    r = await client.get("/api/v1/me/assistant", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 403


# ─── 8. Scoped token CANNOT access admin (missing admin) ───
async def test_scoped_token_blocked_from_admin(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["contributions:write"])
    r = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 403


# ─── 9. Scoped token CANNOT manage tokens (missing tokens:manage) ───
async def test_scoped_token_blocked_from_token_management(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["contributions:write"])
    r = await client.post(
        "/api/v1/me/tokens",
        json={"name": "escalation"},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert r.status_code == 403


# ─── 10. Wildcard token has full access ───
async def test_wildcard_token_full_access(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["*"])
    r = await client.get("/api/v1/projects", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 200
    r = await client.get("/api/v1/me/assistant", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 200


# ─── 11. Browser cookie session has full access (no scope restriction) ───
async def test_cookie_session_full_access(client):
    await _register_login(client, "admin@example.com")
    assert (await client.get("/api/v1/projects")).status_code == 200
    assert (await client.get("/api/v1/me/assistant")).status_code == 200
    assert (await client.get("/api/v1/me/tokens")).status_code == 200


# ─── 12. Invalid scope rejected at creation ───
async def test_invalid_scope_rejected(client):
    await _register_login(client, "admin@example.com")
    r = await client.post(
        "/api/v1/me/tokens",
        json={"name": "bad", "scopes": ["nonexistent:scope"]},
    )
    assert r.status_code == 422


# ─── 13. Anti-escalation: scoped token cannot create wildcard token ───
async def test_scoped_token_cannot_create_wildcard(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["tokens:manage"])
    r = await client.post(
        "/api/v1/me/tokens",
        json={"name": "escalate", "scopes": ["*"]},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert r.status_code == 403
    assert "wildcard" in r.json()["detail"].lower()


# ─── 14. Scope 403 not 401 ───
async def test_scope_failure_is_403_not_401(client, session):
    await _register_login(client, "admin@example.com")
    user = await _get_user(session, "admin@example.com")
    raw = await _create_scoped_token(session, user, ["contributions:write"])
    r = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 403


# ─── 15. Token list shows scopes and agent_name ───
async def test_token_list_shows_scopes_and_agent(client):
    await _register_login(client, "admin@example.com")
    await client.post(
        "/api/v1/me/tokens",
        json={"name": "my-agent", "scopes": ["contributions:write"], "agent_name": "claude-code"},
    )
    r = await client.get("/api/v1/me/tokens")
    assert r.status_code == 200
    tokens = r.json()
    mine = next(t for t in tokens if t["name"] == "my-agent")
    assert mine["scopes"] == ["contributions:write"]
    assert mine["agent_name"] == "claude-code"
