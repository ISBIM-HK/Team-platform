"""Project repository."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import TaskStatus
from src.models.project import INBOX_NAME, Project
from src.models.project_member import ProjectMember
from src.models.task import Task


class ProjectRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, project_id: uuid.UUID) -> Project | None:
        return await self.session.get(Project, project_id)

    async def list_by_tenant(self, tenant_id: uuid.UUID) -> list[Project]:
        stmt = (
            select(Project)
            .where(Project.tenant_id == tenant_id)
            .order_by(Project.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_for_member(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> list[Project]:
        """Projects where the user is a member (project-level ACL, 附录 K)."""
        stmt = (
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(Project.tenant_id == tenant_id, ProjectMember.user_id == user_id)
            .order_by(Project.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_ids_for_member(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        stmt = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_inbox(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> Project | None:
        """The per-user Inbox ("未分类"). Per-user so it respects project ACL."""
        stmt = select(Project).where(
            Project.tenant_id == tenant_id,
            Project.name == INBOX_NAME,
            Project.created_by == user_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def ensure_inbox(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> Project:
        """Get-or-create the user's own Inbox and ensure they are its lead member."""
        from src.repositories.project_member_repo import ProjectMemberRepository

        inbox = await self.get_inbox(tenant_id, user_id)
        if inbox:
            return inbox
        inbox = Project(
            tenant_id=tenant_id, name=INBOX_NAME, description="", status="active",
            created_by=user_id,
        )
        self.session.add(inbox)
        await self.session.flush()
        await self.session.refresh(inbox)
        await ProjectMemberRepository(self.session).add(tenant_id, inbox.id, user_id, role="lead")
        return inbox

    async def create(self, project: Project) -> Project:
        self.session.add(project)
        await self.session.flush()
        await self.session.refresh(project)
        return project

    async def update(self, project: Project) -> Project:
        self.session.add(project)
        await self.session.flush()
        await self.session.refresh(project)
        return project

    async def status_counts(self, project_id: uuid.UUID) -> dict[str, int]:
        """Task count per status for a project (for board/share summary)."""
        stmt = (
            select(Task.status, func.count())
            .where(Task.project_id == project_id)
            .group_by(Task.status)
        )
        rows = (await self.session.execute(stmt)).all()
        counts = {s.value: 0 for s in TaskStatus}
        for status, n in rows:
            counts[status.value if hasattr(status, "value") else str(status)] = n
        return counts
