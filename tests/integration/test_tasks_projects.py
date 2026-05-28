"""Projects + task board: create, status-machine transitions, share view."""


async def _project(client, name="Proj"):
    r = await client.post("/api/v1/projects", json={"name": name, "description": "d"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _task(client, pid, title="t"):
    r = await client.post("/api/v1/tasks", json={"title": title, "project_id": pid})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_create_and_list_project(auth_client):
    pid = await _project(auth_client, "投标助手")
    listed = (await auth_client.get("/api/v1/projects")).json()
    names = {p["name"] for p in listed}
    assert "投标助手" in names
    detail = (await auth_client.get(f"/api/v1/projects/{pid}")).json()
    assert detail["task_count"] == 0 and detail["completion"] == 0.0


async def test_valid_transition_todo_to_done(auth_client):
    pid = await _project(auth_client)
    tid = await _task(auth_client, pid)
    assert (await auth_client.patch(f"/api/v1/tasks/{tid}", json={"status": "in_progress"})).status_code == 200
    r = await auth_client.patch(f"/api/v1/tasks/{tid}", json={"status": "done"})
    assert r.status_code == 200 and r.json()["status"] == "done"


async def test_invalid_transition_rejected(auth_client):
    pid = await _project(auth_client)
    tid = await _task(auth_client, pid)
    # todo → done is not allowed (must pass through in_progress)
    r = await auth_client.patch(f"/api/v1/tasks/{tid}", json={"status": "done"})
    assert r.status_code == 422


async def test_share_reflects_completion(auth_client):
    pid = await _project(auth_client)
    t1 = await _task(auth_client, pid, "a")
    await _task(auth_client, pid, "b")
    await auth_client.patch(f"/api/v1/tasks/{t1}", json={"status": "in_progress"})
    await auth_client.patch(f"/api/v1/tasks/{t1}", json={"status": "done"})
    share = (await auth_client.get(f"/api/v1/projects/{pid}/share")).json()
    assert share["project"]["task_count"] == 2
    assert share["project"]["done_count"] == 1
    assert len(share["tasks"]) == 2


async def test_other_tenant_project_hidden_404(auth_client, session):
    """A project in another tenant must look non-existent (404, not 403)."""
    from src.models.project import Project
    from src.models.tenant import Tenant

    other = Tenant(name="Other Co")
    session.add(other)
    await session.flush()
    foreign = Project(tenant_id=other.id, name="secret", description="", status="active")
    session.add(foreign)
    await session.flush()
    r = await auth_client.get(f"/api/v1/projects/{foreign.id}")
    assert r.status_code == 404
