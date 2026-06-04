"""Notification inbox routes (附录 I.3) — owner-only; SSE for real-time push."""

import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession, require_scope
from src.core.security import read_session_token
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


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("notifications:write")),
):
    repo = NotificationRepository(session)
    n = await repo.get_by_id(notification_id)
    if not n or n.recipient_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    await session.delete(n)


@router.delete("", status_code=204)
async def clear_all_notifications(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("notifications:write")),
):
    items = await NotificationRepository(session).list_for_user(current_user.id)
    for n in items:
        await session.delete(n)


@router.get("/stream")
async def notification_stream(request: Request):
    """SSE endpoint — lightweight auth (cookie only, no DB session held)."""
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id_str = read_session_token(token)
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user_id = uuid.UUID(user_id_str)

    async def event_generator():
        q = subscribe(user_id)
        alive = 0
        try:
            while alive < 60:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                    alive = 0
                except TimeoutError:
                    yield ": keepalive\n\n"
                    alive += 1
        finally:
            unsubscribe(user_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
