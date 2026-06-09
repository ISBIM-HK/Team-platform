"""Page repository — wiki/doc pages scoped to a project, with optimistic locking."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import safe_flush
from src.models.common import utcnow
from src.models.page import Page


class PageRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_by_project(self, tenant_id: uuid.UUID, project_id: uuid.UUID) -> list[Page]:
        """All non-deleted pages for a project, ordered by position then created_at."""
        stmt = (
            select(Page)
            .where(
                Page.tenant_id == tenant_id,
                Page.project_id == project_id,
                Page.status != "deleted",
            )
            .order_by(Page.position.asc(), Page.created_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_by_id(self, page_id: uuid.UUID) -> Page | None:
        stmt = select(Page).where(Page.id == page_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def create(self, page: Page) -> Page:
        self.session.add(page)
        await safe_flush(self.session)
        await self.session.refresh(page)
        return page

    async def update(self, page: Page, expected_version: int) -> Page:
        """Update with optimistic lock — raises ValueError on version mismatch."""
        if page.version != expected_version:
            raise ValueError(f"Version conflict: expected {expected_version}, current {page.version}")
        page.version += 1
        page.updated_at = utcnow()
        self.session.add(page)
        await safe_flush(self.session)
        return page

    async def soft_delete(self, page_id: uuid.UUID) -> None:
        """Set status='deleted' and update timestamp."""
        page = await self.get_by_id(page_id)
        if page:
            page.status = "deleted"
            page.updated_at = utcnow()
            self.session.add(page)
            await safe_flush(self.session)

    async def restore(self, page_id: uuid.UUID) -> Page | None:
        """Set status='active' and update timestamp."""
        page = await self.get_by_id(page_id)
        if page:
            page.status = "active"
            page.updated_at = utcnow()
            self.session.add(page)
            await safe_flush(self.session)
        return page
