"""Assistant skills (附录 J.5): instruction-bundle CRUD + enabled-only injection."""

import uuid

from src.ai.assistant import skills_prompt_section
from src.models.assistant_skill import AssistantSkill
from src.models.tenant import Tenant
from src.models.user import User


class _Ctx:
    """Minimal stand-in for RunContext — tools only touch ctx.deps."""

    def __init__(self, deps):
        self.deps = deps


def test_skills_section_injects_enabled_only():
    skills = [
        AssistantSkill(
            workspace_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            name="代码评审",
            description="d",
            instruction_md="逐行看 diff,关注边界",
            enabled=True,
        ),
        AssistantSkill(
            workspace_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            name="禁用的",
            instruction_md="不该出现",
            enabled=False,
        ),
    ]
    s = skills_prompt_section(skills)
    assert "## 技能" in s
    assert "代码评审" in s and "逐行看 diff" in s
    assert "不该出现" not in s


def test_skills_section_empty():
    assert skills_prompt_section([]) == ""


async def test_skill_crud(auth_client):
    r = await auth_client.post(
        "/api/v1/me/assistant/skills",
        json={"name": "代码评审", "description": "看 diff", "instruction_md": "逐行看 diff,关注边界条件"},
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]

    items = (await auth_client.get("/api/v1/me/assistant/skills")).json()["items"]
    assert any(s["id"] == sid and s["name"] == "代码评审" for s in items)

    r2 = await auth_client.patch(f"/api/v1/me/assistant/skills/{sid}", json={"enabled": False})
    assert r2.status_code == 200 and r2.json()["enabled"] is False

    d = await auth_client.delete(f"/api/v1/me/assistant/skills/{sid}")
    assert d.status_code in (200, 204)
    items2 = (await auth_client.get("/api/v1/me/assistant/skills")).json()["items"]
    assert all(s["id"] != sid for s in items2)


async def test_skill_other_user_404(auth_client, session):
    """A skill in another user's workspace must look non-existent."""
    from src.models.assistant_workspace import AssistantWorkspace
    from src.models.tenant import Tenant
    from src.models.user import User

    t = Tenant(name="Other")
    session.add(t)
    await session.flush()
    u = User(tenant_id=t.id, email="other-skill@example.com", display_name="O")
    session.add(u)
    await session.flush()
    ws = AssistantWorkspace(tenant_id=t.id, user_id=u.id)
    session.add(ws)
    await session.flush()
    sk = AssistantSkill(workspace_id=ws.id, tenant_id=t.id, name="secret", instruction_md="x")
    session.add(sk)
    await session.flush()

    r = await auth_client.patch(f"/api/v1/me/assistant/skills/{sk.id}", json={"enabled": False})
    assert r.status_code == 404


async def test_save_and_improve_skill_tools(session):
    """Assistant self-creates/improves skills via tools (附录 J.5 闭环)."""
    from src.ai.tools import AssistantDeps, improve_skill, save_skill
    from src.repositories.assistant_repo import AssistantWorkspaceRepository
    from src.repositories.assistant_skill_repo import AssistantSkillRepository

    t = Tenant(name="T")
    session.add(t)
    await session.flush()
    u = User(tenant_id=t.id, email="skilltool@example.com", display_name="S")
    session.add(u)
    await session.flush()
    ctx = _Ctx(AssistantDeps(session=session, user_id=u.id, tenant_id=t.id))

    await save_skill(ctx, "代码评审", "看 diff", "逐行看 diff")
    ws = await AssistantWorkspaceRepository(session).ensure(t.id, u.id)
    skills = await AssistantSkillRepository(session).list_by_workspace(ws.id)
    sk = next(s for s in skills if s.name == "代码评审")
    assert sk.enabled and "逐行看 diff" in sk.instruction_md

    await improve_skill(ctx, "代码评审", "逐行看 diff,重点边界与并发")
    skills2 = await AssistantSkillRepository(session).list_by_workspace(ws.id)
    assert "并发" in next(s for s in skills2 if s.name == "代码评审").instruction_md

    msg = await improve_skill(ctx, "不存在的技能", "x")
    assert "找不到" in msg
