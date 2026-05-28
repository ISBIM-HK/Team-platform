"""Project repository."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import TaskStatus
from src.models.project import INBOX_NAME, Project
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

    async def get_inbox(self, tenant_id: uuid.UUID) -> Project | None:
        stmt = select(Project).where(
            Project.tenant_id == tenant_id, Project.name == INBOX_NAME
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def ensure_inbox(self, tenant_id: uuid.UUID) -> Project:
        inbox = await self.get_inbox(tenant_id)
        if inbox:
            return inbox
        inbox = Project(tenant_id=tenant_id, name=INBOX_NAME, description="", status="active")
        self.session.add(inbox)
        await self.session.flush()
        await self.session.refresh(inbox)
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
