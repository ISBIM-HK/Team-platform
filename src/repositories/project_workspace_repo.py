"""ProjectWorkspace repository — per-project shared context, optimistic locking."""

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import utcnow
from src.models.project_workspace import ProjectWorkspace


class ProjectWorkspaceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_project(self, project_id: uuid.UUID) -> ProjectWorkspace | None:
        stmt = select(ProjectWorkspace).where(ProjectWorkspace.project_id == project_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def ensure(self, tenant_id: uuid.UUID, project_id: uuid.UUID) -> ProjectWorkspace:
        ws = await self.get_by_project(project_id)
        if ws:
            return ws
        ws = ProjectWorkspace(tenant_id=tenant_id, project_id=project_id)
        self.session.add(ws)
        await self.session.flush()
        return ws

    async def patch(
        self,
        ws: ProjectWorkspace,
        *,
        background_md: str | None = None,
        context_md: str | None = None,
        current_focus_md: str | None = None,
        updated_by: uuid.UUID,
        expected_version: int,
    ) -> ProjectWorkspace:
        if ws.version != expected_version:
            raise HTTPException(
                status_code=409,
                detail=f"Version conflict: expected {expected_version}, current {ws.version}",
            )
        if background_md is not None:
            ws.background_md = background_md
        if context_md is not None:
            ws.context_md = context_md
        if current_focus_md is not None:
            ws.current_focus_md = current_focus_md
        ws.version += 1
        ws.updated_by = updated_by
        ws.updated_at = utcnow()
        self.session.add(ws)
        await self.session.flush()
        return ws
