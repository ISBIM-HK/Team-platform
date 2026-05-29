"""Notification inbox routes (附录 I.3) — owner-only; in-app only (no external push)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession
from src.models.common import NotificationKind
from src.repositories.notification_repo import NotificationRepository

router = APIRouter(prefix="/me/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: uuid.UUID
    kind: NotificationKind
    title: str
    body: str
    source_ref: dict | None = None
    read_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    current_user: CurrentUser,
    session: DBSession,
    unread: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    repo = NotificationRepository(session)
    items = await repo.list_for_user(current_user.id, unread_only=unread, limit=limit, offset=offset)
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items], total=len(items)
    )


@router.get("/unread-count")
async def unread_count(current_user: CurrentUser, session: DBSession):
    return {"unread": await NotificationRepository(session).unread_count(current_user.id)}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    repo = NotificationRepository(session)
    n = await repo.get_by_id(notification_id)
    # 404 over 403 when hidden from caller (§8) — don't leak another user's notification
    if not n or n.recipient_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    await repo.mark_read(n)
    return {"status": "read"}
