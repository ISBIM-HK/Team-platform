"""Notification inbox routes (附录 I.3) — owner-only; SSE for real-time push."""

import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession, require_scope
from src.models.common import NotificationKind
from src.repositories.notification_repo import NotificationRepository
from src.services.sse_bus import subscribe, unsubscribe

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
    _scope: None = Depends(require_scope("notifications:read")),
    unread: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    repo = NotificationRepository(session)
    items = await repo.list_for_user(current_user.id, unread_only=unread, limit=limit, offset=offset)
    return NotificationListResponse(items=[NotificationResponse.model_validate(n) for n in items], total=len(items))


@router.get("/unread-count")
async def unread_count(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("notifications:read")),
):
    return {"unread": await NotificationRepository(session).unread_count(current_user.id)}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("notifications:write")),
):
    repo = NotificationRepository(session)
    n = await repo.get_by_id(notification_id)
    # 404 over 403 when hidden from caller (§8) — don't leak another user's notification
    if not n or n.recipient_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    await repo.mark_read(n)
    return {"status": "read"}


@router.get("/stream")
async def notification_stream(
    request: Request,
    current_user: CurrentUser,
):
    """SSE endpoint — pushes new notification events in real time."""

    async def event_generator():
        q = subscribe(current_user.id)
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            unsubscribe(current_user.id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
