"""Org group management routes — admin/pm only."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession, require_scope
from src.models.org_group import OrgGroup
from src.repositories.org_group_repo import OrgGroupRepository
from src.repositories.user_repo import UserRepository

router = APIRouter(prefix="/admin/groups", tags=["groups"])


def _require_admin_or_pm(user) -> None:
    if not (user.is_admin or user.is_pm):
        raise HTTPException(status_code=403, detail="Admin or PM required")


class GroupCreate(BaseModel):
    name: str
    parent_group_id: str | None = None
    description: str = ""


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_group_id: str | None = None
    sort_order: int | None = None


class GroupResponse(BaseModel):
    id: str
    name: str
    parent_group_id: str | None
    description: str
    sort_order: int
    archived_at: datetime | None
    member_count: int = 0
    model_config = {"from_attributes": True}


class GroupMemberResponse(BaseModel):
    user_id: str
    display_name: str
    email: str


class MemberAction(BaseModel):
    user_id: str


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("admin")),
):
    _require_admin_or_pm(current_user)
    repo = OrgGroupRepository(session)
    groups = await repo.list_by_tenant(current_user.tenant_id)
    member_counts = {}
    for g in groups:
        uids = await repo.expand_group_user_ids(current_user.tenant_id, g.id)
        member_counts[g.id] = len(uids)
    result = []
    for g in groups:
        result.append(
            GroupResponse(
                id=str(g.id),
                name=g.name,
                parent_group_id=str(g.parent_group_id) if g.parent_group_id else None,
                description=g.description,
                sort_order=g.sort_order,
                archived_at=g.archived_at,
                member_count=member_counts.get(g.id, 0),
            )
        )
    return result


@router.post("", response_model=GroupResponse, status_code=201)
async def create_group(
    req: GroupCreate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("admin")),
):
    _require_admin_or_pm(current_user)
    parent_id = uuid.UUID(req.parent_group_id) if req.parent_group_id else None
    group = OrgGroup(
        tenant_id=current_user.tenant_id,
        name=req.name.strip(),
        parent_group_id=parent_id,
        description=req.description,
        created_by=current_user.id,
    )
    try:
        group = await OrgGroupRepository(session).create(group)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return GroupResponse(
        id=str(group.id),
        name=group.name,
        parent_group_id=str(group.parent_group_id) if group.parent_group_id else None,
        description=group.description,
        sort_order=group.sort_order,
        archived_at=group.archived_at,
        member_count=0,
    )


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    req: GroupUpdate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("admin")),
):
    _require_admin_or_pm(current_user)
    repo = OrgGroupRepository(session)
    group = await repo.get_by_id(group_id)
    if not group or group.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Group not found")
    if req.name is not None:
        group.name = req.name.strip()
    if req.description is not None:
        group.description = req.description
    if req.sort_order is not None:
        group.sort_order = req.sort_order
    if req.parent_group_id is not None:
        group.parent_group_id = uuid.UUID(req.parent_group_id) if req.parent_group_id else None
    try:
        group = await repo.update(group)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    members = await repo.get_members(group.id)
    return GroupResponse(
        id=str(group.id),
        name=group.name,
        parent_group_id=str(group.parent_group_id) if group.parent_group_id else None,
        description=group.description,
        sort_order=group.sort_order,
        archived_at=group.archived_at,
        member_count=len(members),
    )


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("admin")),
):
    _require_admin_or_pm(current_user)
    repo = OrgGroupRepository(session)
    group = await repo.get_by_id(group_id)
    if not group or group.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Group not found")
    await repo.delete(group)


@router.get("/{group_id}/members", response_model=list[GroupMemberResponse])
async def list_group_members(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("admin")),
):
    _require_admin_or_pm(current_user)
    repo = OrgGroupRepository(session)
    group = await repo.get_by_id(group_id)
    if not group or group.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Group not found")
    members = await repo.get_members(group_id)
    user_repo = UserRepository(session)
    result = []
    for m in members:
        u = await user_repo.get_by_id(m.user_id)
        if u:
            result.append(GroupMemberResponse(user_id=str(u.id), display_name=u.display_name, email=u.email))
    return result


@router.post("/{group_id}/members", response_model=list[GroupMemberResponse], status_code=201)
async def add_group_member(
    group_id: uuid.UUID,
    req: MemberAction,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("admin")),
):
    _require_admin_or_pm(current_user)
    repo = OrgGroupRepository(session)
    group = await repo.get_by_id(group_id)
    if not group or group.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Group not found")
    user_repo = UserRepository(session)
    target = await user_repo.get_by_id(uuid.UUID(req.user_id))
    if not target or target.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")
    await repo.add_member(current_user.tenant_id, group_id, target.id, created_by=current_user.id)
    return await list_group_members(group_id, current_user, session, _scope=None)


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_group_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("admin")),
):
    _require_admin_or_pm(current_user)
    repo = OrgGroupRepository(session)
    group = await repo.get_by_id(group_id)
    if not group or group.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Group not found")
    await repo.remove_member(group_id, user_id)
