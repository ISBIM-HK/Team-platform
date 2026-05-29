"""Project-level ACL + membership (附录 K).

alice is the first registrant → bootstrapped admin+pm (tenant super-permission,
bypasses ACL). bob / carol / dave are plain users used to exercise real ACL.
Switching the active user = register_and_login again (cookie follows last login).
"""

import uuid

from sqlalchemy import select

from src.models.task import Task
from src.models.user import User
from tests.conftest import register_and_login


async def _tenant_id(session) -> uuid.UUID:
    u = (await session.execute(select(User).where(User.email == "bob@example.com"))).scalar_one()
    return u.tenant_id


async def test_creator_is_lead_and_sees_project(client):
    await register_and_login(client, "alice@example.com", "Alice")
    await register_and_login(client, "bob@example.com", "Bob")  # non-pm, now active
    pid = (await client.post("/api/v1/projects", json={"name": "Bob proj"})).json()["id"]

    ids = [x["id"] for x in (await client.get("/api/v1/projects")).json()]
    assert pid in ids
    assert (await client.get(f"/api/v1/projects/{pid}")).status_code == 200
    members = (await client.get(f"/api/v1/projects/{pid}/members")).json()
    assert any(m["role"] == "lead" for m in members)


async def test_non_member_cannot_see_project(client):
    await register_and_login(client, "alice@example.com", "Alice")
    await register_and_login(client, "bob@example.com", "Bob")
    pid = (await client.post("/api/v1/projects", json={"name": "Bob proj"})).json()["id"]

    await register_and_login(client, "carol@example.com", "Carol")  # outsider, non-pm
    assert pid not in [x["id"] for x in (await client.get("/api/v1/projects")).json()]
    assert (await client.get(f"/api/v1/projects/{pid}")).status_code == 404
    assert (await client.get(f"/api/v1/projects/{pid}/tasks")).status_code == 404
    assert (await client.get(f"/api/v1/projects/{pid}/share")).status_code == 404
    assert (await client.post(f"/api/v1/projects/{pid}/brief")).status_code == 404


async def test_member_sees_after_added(client):
    await register_and_login(client, "alice@example.com", "Alice")
    await register_and_login(client, "bob@example.com", "Bob")
    pid = (await client.post("/api/v1/projects", json={"name": "Bob proj"})).json()["id"]
    carol = await register_and_login(client, "carol@example.com", "Carol")
    carol_id = carol["user_id"]

    await register_and_login(client, "bob@example.com", "Bob")  # lead
    r = await client.post(f"/api/v1/projects/{pid}/members", json={"user_id": carol_id})
    assert r.status_code in (200, 201), r.text

    await register_and_login(client, "carol@example.com", "Carol")
    assert (await client.get(f"/api/v1/projects/{pid}")).status_code == 200
    assert pid in [x["id"] for x in (await client.get("/api/v1/projects")).json()]


async def test_members_add_is_lead_only(client):
    await register_and_login(client, "alice@example.com", "Alice")
    await register_and_login(client, "bob@example.com", "Bob")
    pid = (await client.post("/api/v1/projects", json={"name": "P"})).json()["id"]
    carol = await register_and_login(client, "carol@example.com", "Carol")
    dave = await register_and_login(client, "dave@example.com", "Dave")

    # bob (lead) adds carol as member
    await register_and_login(client, "bob@example.com", "Bob")
    await client.post(f"/api/v1/projects/{pid}/members", json={"user_id": carol["user_id"]})

    # carol (member, not lead) cannot add dave
    await register_and_login(client, "carol@example.com", "Carol")
    r = await client.post(f"/api/v1/projects/{pid}/members", json={"user_id": dave["user_id"]})
    assert r.status_code == 403


async def test_cannot_remove_last_lead(client):
    await register_and_login(client, "alice@example.com", "Alice")
    bob = await register_and_login(client, "bob@example.com", "Bob")
    pid = (await client.post("/api/v1/projects", json={"name": "P"})).json()["id"]
    r = await client.delete(f"/api/v1/projects/{pid}/members/{bob['user_id']}")
    assert r.status_code == 422


async def test_claim_requires_membership(client, session):
    await register_and_login(client, "alice@example.com", "Alice")
    bob = await register_and_login(client, "bob@example.com", "Bob")
    pid = (await client.post("/api/v1/projects", json={"name": "P"})).json()["id"]

    tenant_id = await _tenant_id(session)
    t = Task(
        tenant_id=tenant_id,
        project_id=uuid.UUID(pid),
        title="claimable",
        created_by=f"user:{bob['user_id']}",
    )
    session.add(t)
    await session.flush()

    carol = await register_and_login(client, "carol@example.com", "Carol")  # non-member
    assert (await client.post(f"/api/v1/tasks/{t.id}/claim")).status_code == 404

    await register_and_login(client, "bob@example.com", "Bob")
    await client.post(f"/api/v1/projects/{pid}/members", json={"user_id": carol["user_id"]})
    await register_and_login(client, "carol@example.com", "Carol")
    assert (await client.post(f"/api/v1/tasks/{t.id}/claim")).status_code == 200


async def test_dispatch_lead_only_candidates_are_members(client, monkeypatch):
    from src.ai.schemas import AssignmentSuggestion

    captured = {}

    async def fake(title, desc, members, record):
        captured["members"] = members
        return AssignmentSuggestion(
            user_id=members[0]["user_id"], user_name=members[0]["name"], rationale="r", confidence=0.9
        )

    monkeypatch.setattr("src.api.routes.tasks.suggest_assignment", fake)

    await register_and_login(client, "alice@example.com", "Alice")
    bob = await register_and_login(client, "bob@example.com", "Bob")
    pid = (await client.post("/api/v1/projects", json={"name": "P"})).json()["id"]
    tid = (await client.post("/api/v1/tasks", json={"title": "X", "project_id": pid})).json()["id"]
    carol = await register_and_login(client, "carol@example.com", "Carol")

    await register_and_login(client, "bob@example.com", "Bob")  # lead
    await client.post(f"/api/v1/projects/{pid}/members", json={"user_id": carol["user_id"]})
    r = await client.post(f"/api/v1/tasks/{tid}/suggest-assignment")
    assert r.status_code == 200, r.text
    assert {m["user_id"] for m in captured["members"]} == {bob["user_id"], carol["user_id"]}

    await register_and_login(client, "carol@example.com", "Carol")  # member, not lead
    assert (await client.post(f"/api/v1/tasks/{tid}/suggest-assignment")).status_code == 403


async def test_inbox_is_per_user(client):
    await register_and_login(client, "alice@example.com", "Alice")
    await register_and_login(client, "bob@example.com", "Bob")
    await client.post("/api/v1/tasks", json={"title": "bob task"})  # → bob's Inbox
    bob_inbox = [p for p in (await client.get("/api/v1/projects")).json() if p["name"] == "未分类"]
    assert len(bob_inbox) == 1
    bob_inbox_id = bob_inbox[0]["id"]

    await register_and_login(client, "carol@example.com", "Carol")
    await client.post("/api/v1/tasks", json={"title": "carol task"})  # → carol's Inbox
    carol_inbox = [p for p in (await client.get("/api/v1/projects")).json() if p["name"] == "未分类"]
    assert len(carol_inbox) == 1
    assert carol_inbox[0]["id"] != bob_inbox_id


async def test_global_tasks_only_member_projects(client):
    await register_and_login(client, "alice@example.com", "Alice")
    await register_and_login(client, "bob@example.com", "Bob")
    pid_bob = (await client.post("/api/v1/projects", json={"name": "Bob P"})).json()["id"]
    tid_bob = (await client.post("/api/v1/tasks", json={"title": "bob t", "project_id": pid_bob})).json()["id"]

    await register_and_login(client, "carol@example.com", "Carol")
    pid_carol = (await client.post("/api/v1/projects", json={"name": "Carol P"})).json()["id"]
    tid_carol = (await client.post("/api/v1/tasks", json={"title": "carol t", "project_id": pid_carol})).json()["id"]

    carol_task_ids = [t["id"] for t in (await client.get("/api/v1/tasks")).json()["items"]]
    assert tid_carol in carol_task_ids
    assert tid_bob not in carol_task_ids


async def test_pm_admin_bypasses_acl(client):
    await register_and_login(client, "alice@example.com", "Alice")  # admin+pm
    await register_and_login(client, "bob@example.com", "Bob")
    pid = (await client.post("/api/v1/projects", json={"name": "Bob P"})).json()["id"]
    tid = (await client.post("/api/v1/tasks", json={"title": "bob t", "project_id": pid})).json()["id"]

    await register_and_login(client, "alice@example.com", "Alice")  # privileged, not a member
    assert pid in [p["id"] for p in (await client.get("/api/v1/projects")).json()]
    assert (await client.get(f"/api/v1/projects/{pid}")).status_code == 200
    assert tid in [t["id"] for t in (await client.get("/api/v1/tasks")).json()["items"]]
