"""Notification repository (站内收件箱, owner-only at the API layer)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import safe_flush
from src.models.common import utcnow
from src.models.notification import Notification


class NotificationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, notification: Notification) -> Notification:
        self.session.add(notification)
        await safe_flush(self.session)
        return notification

    async def list_for_user(
        self, user_id: uuid.UUID, unread_only: bool = False, limit: int = 50, offset: int = 0
    ) -> list[Notification]:
        stmt = select(Notification).where(Notification.recipient_user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
        return list((await self.session.execute(stmt)).scalars().all())

    async def unread_count(self, user_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_user_id == user_id, Notification.read_at.is_(None))
        )
        return (await self.session.execute(stmt)).scalar_one()

    async def get_by_id(self, notification_id: uuid.UUID) -> Notification | None:
        return await self.session.get(Notification, notification_id)

    async def mark_read(self, notification: Notification) -> None:
        notification.read_at = utcnow()
        self.session.add(notification)
        await safe_flush(self.session)
