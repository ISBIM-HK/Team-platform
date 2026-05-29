"""ProjectMember repository — membership lookups + role management (附录 K)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.project_member import ProjectMember


class ProjectMemberRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectMember | None:
        stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def role_of(self, project_id: uuid.UUID, user_id: uuid.UUID) -> str | None:
        m = await self.get(project_id, user_id)
        return m.role if m else None

    async def is_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return await self.get(project_id, user_id) is not None

    async def list_by_project(self, project_id: uuid.UUID) -> list[ProjectMember]:
        stmt = (
            select(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.added_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def count_leads(self, project_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(ProjectMember)
            .where(ProjectMember.project_id == project_id, ProjectMember.role == "lead")
        )
        return (await self.session.execute(stmt)).scalar_one()

    async def add(
        self,
        tenant_id: uuid.UUID,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str = "member",
    ) -> ProjectMember:
        """Add a member, or update role if already present (idempotent)."""
        existing = await self.get(project_id, user_id)
        if existing:
            if existing.role != role:
                existing.role = role
                self.session.add(existing)
                await self.session.flush()
            return existing
        m = ProjectMember(
            tenant_id=tenant_id, project_id=project_id, user_id=user_id, role=role
        )
        self.session.add(m)
        await self.session.flush()
        await self.session.refresh(m)
        return m

    async def remove(self, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        m = await self.get(project_id, user_id)
        if m:
            await self.session.delete(m)
            await self.session.flush()
