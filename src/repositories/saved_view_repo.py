"""Saved view repository."""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import utcnow
from src.models.saved_view import SavedView


class SavedViewRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, view_id: uuid.UUID) -> SavedView | None:
        return await self.session.get(SavedView, view_id)

    async def list_by_owner(
        self,
        tenant_id: uuid.UUID,
        owner_user_id: uuid.UUID,
    ) -> list[SavedView]:
        stmt = (
            select(SavedView)
            .where(SavedView.tenant_id == tenant_id, SavedView.owner_user_id == owner_user_id)
            .order_by(SavedView.position.asc(), SavedView.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_by_project(
        self,
        tenant_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[SavedView]:
        """Project shared views (visibility='project')."""
        stmt = (
            select(SavedView)
            .where(
                SavedView.tenant_id == tenant_id,
                SavedView.project_id == project_id,
                SavedView.visibility == "project",
            )
            .order_by(SavedView.position.asc(), SavedView.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, view: SavedView) -> SavedView:
        self.session.add(view)
        await self.session.flush()
        await self.session.refresh(view)
        return view

    async def update(self, view: SavedView) -> SavedView:
        view.updated_at = utcnow()
        self.session.add(view)
        await self.session.flush()
        await self.session.refresh(view)
        return view

    async def delete(self, view_id: uuid.UUID) -> None:
        stmt = delete(SavedView).where(SavedView.id == view_id)
        await self.session.execute(stmt)
        await self.session.flush()
