"""Telegram webhook — receives group messages, stores to events_cache for later summarization."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.capture.telegram import map_event_type, parse_update, webhook_secret_token
from src.core.crypto import decrypt_credential
from src.core.database import get_session
from src.models.common import EventSource, IntegrationProvider
from src.models.event_cache import EventCache
from src.models.integration import Integration

logger = logging.getLogger(__name__)

router = APIRouter(tags=["telegram"])


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Public endpoint — Telegram sends updates here. Only stores messages; no AI processing."""
    body = await request.json()
    parsed = parse_update(body)
    if not parsed:
        return {"ok": True}

    if parsed["chat_type"] not in ("group", "supergroup"):
        return {"ok": True}

    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not secret:
        raise HTTPException(status_code=403, detail="Missing secret token")

    async for session in get_session():
        integ = await _find_integration_by_secret(session, secret)
        if not integ:
            raise HTTPException(status_code=403, detail="Unknown bot")

        external_id = f"tg_{parsed['chat_id']}_{parsed['message_id']}"
        existing = await session.execute(
            select(EventCache.id).where(
                EventCache.tenant_id == integ.tenant_id,
                EventCache.source == EventSource.telegram,
                EventCache.external_id == external_id,
            )
        )
        if existing.scalar_one_or_none():
            return {"ok": True}

        session.add(
            EventCache(
                tenant_id=integ.tenant_id,
                source=EventSource.telegram,
                event_type=map_event_type(parsed),
                actor_user_id=integ.user_id,
                external_id=external_id,
                payload={
                    "chat_id": parsed["chat_id"],
                    "chat_title": parsed["chat_title"],
                    "sender_name": parsed["sender_name"],
                    "sender_username": parsed["sender_username"],
                    "text": parsed["text"],
                    "message_id": parsed["message_id"],
                },
                occurred_at=parsed["date"],
            )
        )
        await session.commit()

    return {"ok": True}


async def _find_integration_by_secret(session: AsyncSession, secret: str) -> Integration | None:
    stmt = select(Integration).where(
        Integration.provider == IntegrationProvider.telegram,
        Integration.enabled == True,  # noqa: E712
    )
    rows = (await session.execute(stmt)).scalars().all()
    for integ in rows:
        cred = decrypt_credential(integ.credential)
        token = cred.get("bot_token", "")
        if token and webhook_secret_token(token) == secret:
            return integ
    return None
