"""Assistant persistent workspace (附录 J): prompt injection, lazy-create, partial PATCH, tool appends."""

import uuid

from sqlalchemy import select

from src.ai.assistant import workspace_prompt_section
from src.models.assistant_workspace import AssistantWorkspace
from src.models.user import User
from src.repositories.assistant_repo import AssistantWorkspaceRepository


def test_prompt_section_injects_set_docs():
    ws = AssistantWorkspace(
        tenant_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        persona_md="你简洁",
        profile_md="偏好中文",
        memory_md="项目用 DeepSeek",
    )
    s = workspace_prompt_section(ws)
    assert "## 人格" in s and "你简洁" in s
    assert "## 关于用户" in s and "偏好中文" in s
    assert "## 记忆" in s and "项目用 DeepSeek" in s


def test_prompt_section_empty_when_blank():
    ws = AssistantWorkspace(tenant_id=uuid.uuid4(), user_id=uuid.uuid4())
    assert workspace_prompt_section(ws) == ""


async def _alice(session) -> User:
    return (await session.execute(select(User).where(User.email == "alice@example.com"))).scalar_one()


async def test_get_lazy_creates_workspace(auth_client):
    r = await auth_client.get("/api/v1/me/assistant")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["persona_md"] == "" and b["memory_md"] == "" and b["profile_md"] == ""


async def test_patch_is_partial(auth_client):
    await auth_client.get("/api/v1/me/assistant")  # ensure exists
    r = await auth_client.patch("/api/v1/me/assistant", json={"persona_md": "你是简洁的工程助手"})
    assert r.status_code == 200, r.text
    assert r.json()["persona_md"] == "你是简洁的工程助手"

    r2 = await auth_client.patch("/api/v1/me/assistant", json={"memory_md": "团队 6 人"})
    b = r2.json()
    assert b["persona_md"] == "你是简洁的工程助手"  # untouched by a memory-only patch
    assert b["memory_md"] == "团队 6 人"


async def test_repo_append_reflected_in_get(auth_client, session):
    user = await _alice(session)
    repo = AssistantWorkspaceRepository(session)
    ws = await repo.ensure(user.tenant_id, user.id)
    await repo.append_memory(ws, "用户在做投标助手")
    await repo.append_profile(ws, "偏好简洁回复")

    got = (await auth_client.get("/api/v1/me/assistant")).json()
    assert "用户在做投标助手" in got["memory_md"]
    assert "偏好简洁回复" in got["profile_md"]
