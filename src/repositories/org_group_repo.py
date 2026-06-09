"""Repository for org group CRUD + tree operations."""

from __future__ import annotations

import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import safe_flush
from src.models.org_group import OrgGroup, OrgGroupMember

MAX_DEPTH = 4


class OrgGroupRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, group_id: uuid.UUID) -> OrgGroup | None:
        return await self.session.get(OrgGroup, group_id)

    async def list_by_tenant(self, tenant_id: uuid.UUID, *, include_archived: bool = False) -> list[OrgGroup]:
        stmt = select(OrgGroup).where(OrgGroup.tenant_id == tenant_id)
        if not include_archived:
            stmt = stmt.where(OrgGroup.archived_at.is_(None))
        stmt = stmt.order_by(OrgGroup.sort_order.asc(), OrgGroup.name.asc())
        return list((await self.session.execute(stmt)).scalars().all())

    async def create(self, group: OrgGroup) -> OrgGroup:
        if group.parent_group_id:
            depth = await self._depth_of(group.parent_group_id)
            if depth >= MAX_DEPTH - 1:
                raise ValueError(f"Max group nesting depth is {MAX_DEPTH}")
            parent = await self.get_by_id(group.parent_group_id)
            if not parent or parent.tenant_id != group.tenant_id:
                raise ValueError("Parent group not found or wrong tenant")
        self.session.add(group)
        await safe_flush(self.session)
        await self.session.refresh(group)
        return group

    async def update(self, group: OrgGroup) -> OrgGroup:
        if group.parent_group_id:
            if group.parent_group_id == group.id:
                raise ValueError("A group cannot be its own parent")
            parent = await self.get_by_id(group.parent_group_id)
            if not parent or parent.tenant_id != group.tenant_id:
                raise ValueError("Parent group not found or wrong tenant")
            if parent.archived_at:
                raise ValueError("Cannot set archived group as parent")
            await self._check_no_cycle(group.id, group.parent_group_id)
            parent_depth = await self._depth_of(group.parent_group_id)
            subtree_height = await self._subtree_height(group.id)
            if parent_depth + 1 + subtree_height > MAX_DEPTH:
                raise ValueError(f"Move would exceed max depth of {MAX_DEPTH}")
        self.session.add(group)
        await safe_flush(self.session)
        await self.session.refresh(group)
        return group

    async def _check_no_cycle(self, group_id: uuid.UUID, new_parent_id: uuid.UUID) -> None:
        current = new_parent_id
        while current:
            if current == group_id:
                raise ValueError("Circular parent reference detected")
            g = await self.get_by_id(current)
            if not g:
                break
            current = g.parent_group_id

    async def _subtree_height(self, group_id: uuid.UUID) -> int:
        children = (
            (
                await self.session.execute(
                    select(OrgGroup).where(OrgGroup.parent_group_id == group_id, OrgGroup.archived_at.is_(None))
                )
            )
            .scalars()
            .all()
        )
        if not children:
            return 0
        return 1 + max(await self._subtree_height(c.id) for c in children)

    async def delete(self, group: OrgGroup) -> None:
        members = await self.get_members(group.id)
        for m in members:
            await self.session.delete(m)
        children = await self.session.execute(select(OrgGroup).where(OrgGroup.parent_group_id == group.id))
        for child in children.scalars().all():
            child.parent_group_id = group.parent_group_id
            self.session.add(child)
        await self.session.delete(group)
        await safe_flush(self.session)

    async def _depth_of(self, group_id: uuid.UUID) -> int:
        depth = 0
        current_id = group_id
        while current_id:
            g = await self.get_by_id(current_id)
            if not g or not g.parent_group_id:
                break
            current_id = g.parent_group_id
            depth += 1
            if depth >= MAX_DEPTH:
                break
        return depth

    async def get_members(self, group_id: uuid.UUID) -> list[OrgGroupMember]:
        stmt = (
            select(OrgGroupMember).where(OrgGroupMember.group_id == group_id).order_by(OrgGroupMember.created_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def add_member(
        self, tenant_id: uuid.UUID, group_id: uuid.UUID, user_id: uuid.UUID, created_by: uuid.UUID | None = None
    ) -> OrgGroupMember:
        existing = await self._get_membership(group_id, user_id)
        if existing:
            return existing
        m = OrgGroupMember(tenant_id=tenant_id, group_id=group_id, user_id=user_id, created_by=created_by)
        self.session.add(m)
        await safe_flush(self.session)
        await self.session.refresh(m)
        return m

    async def remove_member(self, group_id: uuid.UUID, user_id: uuid.UUID) -> None:
        m = await self._get_membership(group_id, user_id)
        if m:
            await self.session.delete(m)
            await safe_flush(self.session)

    async def _get_membership(self, group_id: uuid.UUID, user_id: uuid.UUID) -> OrgGroupMember | None:
        stmt = select(OrgGroupMember).where(OrgGroupMember.group_id == group_id, OrgGroupMember.user_id == user_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def expand_group_user_ids(self, tenant_id: uuid.UUID, group_id: uuid.UUID) -> set[uuid.UUID]:
        result = await self.session.execute(
            text("""
                WITH RECURSIVE subtree AS (
                    SELECT id FROM org_groups WHERE id = :gid AND tenant_id = :tid AND archived_at IS NULL
                    UNION ALL
                    SELECT g.id FROM org_groups g JOIN subtree s ON g.parent_group_id = s.id
                    WHERE g.tenant_id = :tid AND g.archived_at IS NULL
                )
                SELECT DISTINCT ogm.user_id
                FROM org_group_members ogm
                JOIN subtree s ON ogm.group_id = s.id
                WHERE ogm.tenant_id = :tid
            """),
            {"gid": str(group_id), "tid": str(tenant_id)},
        )
        return {row[0] for row in result}

    async def groups_of_user(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> list[OrgGroup]:
        stmt = (
            select(OrgGroup)
            .join(OrgGroupMember, OrgGroupMember.group_id == OrgGroup.id)
            .where(OrgGroupMember.user_id == user_id, OrgGroup.tenant_id == tenant_id, OrgGroup.archived_at.is_(None))
            .order_by(OrgGroup.name.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())
