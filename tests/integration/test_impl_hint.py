"""Auto implementation hint on claim (附录 I.2): leaf-only, idempotent, persisted."""


async def _project(client):
    return (await client.post("/api/v1/projects", json={"name": "P", "description": ""})).json()["id"]


async def _task(client, pid, title="t", parent=None):
    body = {"title": title, "project_id": pid}
    if parent:
        body["parent_task_id"] = parent
    return (await client.post("/api/v1/tasks", json=body)).json()["id"]


async def test_impl_hint_generated_and_persisted(auth_client, monkeypatch):
    async def fake_hint(title, description="", record=None):
        return "先写失败测试,再实现最小逻辑"

    monkeypatch.setattr("src.api.routes.tasks.suggest_impl_hint", fake_hint)
    pid = await _project(auth_client)
    tid = await _task(auth_client, pid, "做登录")

    r = await auth_client.post(f"/api/v1/tasks/{tid}/impl-hint")
    assert r.status_code == 200, r.text
    assert r.json()["impl_hint"] == "先写失败测试,再实现最小逻辑"

    # persisted → visible on the board task
    tasks = (await auth_client.get(f"/api/v1/projects/{pid}/tasks")).json()
    assert any(t["id"] == tid and t["impl_hint"] == "先写失败测试,再实现最小逻辑" for t in tasks)


async def test_impl_hint_skipped_for_parent(auth_client, monkeypatch):
    calls = {"n": 0}

    async def fake_hint(title, description="", record=None):
        calls["n"] += 1
        return "x"

    monkeypatch.setattr("src.api.routes.tasks.suggest_impl_hint", fake_hint)
    pid = await _project(auth_client)
    parent = await _task(auth_client, pid, "父")
    await _task(auth_client, pid, "子", parent=parent)

    r = await auth_client.post(f"/api/v1/tasks/{parent}/impl-hint")
    assert r.status_code == 200
    assert r.json()["skipped"] == "not_leaf"
    assert r.json()["impl_hint"] is None
    assert calls["n"] == 0  # AI never called for a non-leaf task


async def test_impl_hint_idempotent_unless_regenerate(auth_client, monkeypatch):
    calls = {"n": 0}

    async def fake_hint(title, description="", record=None):
        calls["n"] += 1
        return f"hint-{calls['n']}"

    monkeypatch.setattr("src.api.routes.tasks.suggest_impl_hint", fake_hint)
    pid = await _project(auth_client)
    tid = await _task(auth_client, pid)

    r1 = await auth_client.post(f"/api/v1/tasks/{tid}/impl-hint")
    assert r1.json()["impl_hint"] == "hint-1"

    r2 = await auth_client.post(f"/api/v1/tasks/{tid}/impl-hint")
    assert r2.json()["impl_hint"] == "hint-1" and r2.json()["skipped"] == "exists"
    assert calls["n"] == 1  # not regenerated

    r3 = await auth_client.post(f"/api/v1/tasks/{tid}/impl-hint?regenerate=true")
    assert r3.json()["impl_hint"] == "hint-2"
    assert calls["n"] == 2
