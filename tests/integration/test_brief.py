"""Share AI brief route — aggregation + response shape, with the LLM stubbed."""

from src.ai.brief import ProgressBrief


async def test_brief_returns_structured_summary(auth_client, monkeypatch):
    async def fake_generate(context, record=None):
        # the route should hand us an aggregated context string to summarize
        assert "任务" in context
        return ProgressBrief(summary="进展良好", highlights=["完成登录"], risks=[], next_steps=["接入检索"])

    monkeypatch.setattr("src.api.routes.projects.generate_brief", fake_generate)

    pid = (await auth_client.post("/api/v1/projects", json={"name": "P", "description": ""})).json()["id"]
    await auth_client.post("/api/v1/tasks", json={"title": "登录", "project_id": pid})

    r = await auth_client.post(f"/api/v1/projects/{pid}/brief")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"] == "进展良好"
    assert body["highlights"] == ["完成登录"]
    assert body["next_steps"] == ["接入检索"]


async def test_brief_other_tenant_project_404(auth_client, session, monkeypatch):
    async def fake_generate(context, record=None):
        return ProgressBrief(summary="x")

    monkeypatch.setattr("src.api.routes.projects.generate_brief", fake_generate)

    from src.models.project import Project
    from src.models.tenant import Tenant

    other = Tenant(name="Other Co")
    session.add(other)
    await session.flush()
    foreign = Project(tenant_id=other.id, name="secret", description="", status="active")
    session.add(foreign)
    await session.flush()

    r = await auth_client.post(f"/api/v1/projects/{foreign.id}/brief")
    assert r.status_code == 404
