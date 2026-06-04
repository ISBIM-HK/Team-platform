"""Assistant persistent workspace routes (附录 J).

Always self-scoped via /me — owner-only structurally (no cross-user access path).
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession, require_scope
from src.models.assistant_skill import AssistantSkill
from src.repositories.assistant_repo import AssistantWorkspaceRepository
from src.repositories.assistant_skill_repo import AssistantSkillRepository

router = APIRouter(prefix="/me/assistant", tags=["assistant"])


class WorkspaceResponse(BaseModel):
    persona_md: str
    memory_md: str
    profile_md: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkspacePatch(BaseModel):
    persona_md: str | None = None
    memory_md: str | None = None
    profile_md: str | None = None


@router.get("", response_model=WorkspaceResponse)
async def get_workspace(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("assistant:read")),
):
    ws = await AssistantWorkspaceRepository(session).ensure(current_user.tenant_id, current_user.id)
    return WorkspaceResponse.model_validate(ws)


@router.patch("", response_model=WorkspaceResponse)
async def patch_workspace(
    req: WorkspacePatch,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("assistant:write")),
):
    """Partial update — only provided fields change (附录 J.4)."""
    repo = AssistantWorkspaceRepository(session)
    ws = await repo.ensure(current_user.tenant_id, current_user.id)
    ws = await repo.patch(ws, persona_md=req.persona_md, memory_md=req.memory_md, profile_md=req.profile_md)
    return WorkspaceResponse.model_validate(ws)


# ─── skills (附录 J.5) — instruction bundles under the workspace ───
class SkillResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    instruction_md: str
    enabled: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class SkillListResponse(BaseModel):
    items: list[SkillResponse]


class SkillCreate(BaseModel):
    name: str
    description: str = ""
    instruction_md: str = ""
    enabled: bool = True


class SkillPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    instruction_md: str | None = None
    enabled: bool | None = None


async def _workspace(current_user, session):
    return await AssistantWorkspaceRepository(session).ensure(current_user.tenant_id, current_user.id)


async def _owned_skill(skill_id: uuid.UUID, current_user, session):
    ws = await _workspace(current_user, session)
    repo = AssistantSkillRepository(session)
    skill = await repo.get(skill_id)
    if not skill or skill.workspace_id != ws.id:  # 404 over 403 — hide others' skills (§8)
        raise HTTPException(status_code=404, detail="Skill not found")
    return repo, skill


@router.get("/skills", response_model=SkillListResponse)
async def list_skills(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("assistant:read")),
):
    ws = await _workspace(current_user, session)
    items = await AssistantSkillRepository(session).list_by_workspace(ws.id)
    return SkillListResponse(items=[SkillResponse.model_validate(s) for s in items])


@router.post("/skills", response_model=SkillResponse, status_code=201)
async def create_skill(
    req: SkillCreate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("assistant:write")),
):
    ws = await _workspace(current_user, session)
    skill = AssistantSkill(
        workspace_id=ws.id,
        tenant_id=current_user.tenant_id,
        name=req.name,
        description=req.description,
        instruction_md=req.instruction_md,
        enabled=req.enabled,
    )
    await AssistantSkillRepository(session).create(skill)
    return SkillResponse.model_validate(skill)


@router.patch("/skills/{skill_id}", response_model=SkillResponse)
async def patch_skill(
    skill_id: uuid.UUID,
    req: SkillPatch,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("assistant:write")),
):
    repo, skill = await _owned_skill(skill_id, current_user, session)
    skill = await repo.update(
        skill,
        name=req.name,
        description=req.description,
        instruction_md=req.instruction_md,
        enabled=req.enabled,
    )
    return SkillResponse.model_validate(skill)


@router.delete("/skills/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("assistant:write")),
):
    repo, skill = await _owned_skill(skill_id, current_user, session)
    await repo.delete(skill)
