"""PAT lifecycle + source-agnostic contribution ingest."""

import uuid

from tests.conftest import register_and_login


async def _pat(client, name="laptop"):
    r = await client.post("/api/v1/me/tokens", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["token"]


async def test_pat_create_list_revoke(auth_client):
    token = await _pat(auth_client)
    assert token.startswith("pat_")
    listed = (await auth_client.get("/api/v1/me/tokens")).json()
    assert len(listed) == 1 and "token" not in listed[0]
    tid = listed[0]["id"]
    assert (await auth_client.delete(f"/api/v1/me/tokens/{tid}")).status_code == 204
    assert (await auth_client.get("/api/v1/me/tokens")).json() == []


async def test_pat_authenticates_like_a_session(auth_client):
    token = await _pat(auth_client)
    auth_client.cookies.clear()  # drop the cookie — rely solely on the Bearer token
    r = await auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "alice@example.com"


async def test_bad_token_rejected(client):
    await register_and_login(client)
    r = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer pat_nonsense"})
    assert r.status_code == 401


async def test_contribution_ingest_and_idempotency(auth_client):
    token = await _pat(auth_client)
    h = {"Authorization": f"Bearer {token}"}
    body = {"summary": "用 Claude Code 调通了登录回调", "kind": "work", "client_id": "c-1"}
    r1 = await auth_client.post("/api/v1/me/contributions", headers=h, json=body)
    assert r1.status_code == 201 and r1.json()["deduped"] is False
    r2 = await auth_client.post("/api/v1/me/contributions", headers=h, json=body)
    assert r2.status_code == 201 and r2.json()["deduped"] is True
    assert r1.json()["event_id"] == r2.json()["event_id"]


async def test_contribution_unknown_project_404(auth_client):
    token = await _pat(auth_client)
    h = {"Authorization": f"Bearer {token}"}
    r = await auth_client.post("/api/v1/me/contributions", headers=h,
                               json={"summary": "x", "project_id": str(uuid.uuid4())})
    assert r.status_code == 404


async def test_contribution_tags_project(auth_client):
    token = await _pat(auth_client)
    h = {"Authorization": f"Bearer {token}"}
    pid = (await auth_client.post("/api/v1/projects", json={"name": "P", "description": ""})).json()["id"]
    r = await auth_client.post("/api/v1/me/contributions", headers=h,
                               json={"summary": "做了点东西", "project_id": pid})
    assert r.status_code == 201 and r.json()["deduped"] is False
