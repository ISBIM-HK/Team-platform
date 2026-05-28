"""Contribution ingest — local AI work → events_cache (source-agnostic).

POST /me/contributions: any client (MCP / CLI / hook / curl) with a PAT can
push a work summary. kind decides event_type; summary goes to payload.
"""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from src.api.deps import CurrentUser, DBSession
from src.models.common import EventSource, EventType, utcnow
from src.models.event_cache import EventCache
from src.repositories.project_repo import ProjectRepository

router = APIRouter(prefix="/me", tags=["contributions"])


class ContributionIn(BaseModel):
    summary: str
    project_id: uuid.UUID | None = None
    kind: str = "work"  # work | commit | note
    client_id: str | None = None  # optional idempotency key → external_id


class ContributionOut(BaseModel):
    event_id: str
    deduped: bool = False


@router.post("/contributions", response_model=ContributionOut, status_code=201)
async def contribute(req: ContributionIn, current_user: CurrentUser, session: DBSession):
    # validate project (if given) belongs to the caller's tenant
    if req.project_id:
        proj = await ProjectRepository(session).get_by_id(req.project_id)
        if not proj or proj.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=404, detail="Project not found")

    # idempotency: if client_id given and already ingested, return existing
    if req.client_id:
        existing = (await session.execute(
            select(EventCache).where(
                EventCache.tenant_id == current_user.tenant_id,
                EventCache.source == EventSource.agent,
                EventCache.external_id == req.client_id,
            )
        )).scalar_one_or_none()
        if existing:
            return ContributionOut(event_id=str(existing.id), deduped=True)

    event_type = EventType.commit if req.kind == "commit" else EventType.manual_log
    event = EventCache(
        tenant_id=current_user.tenant_id,
        project_id=req.project_id,
        source=EventSource.agent,
        event_type=event_type,
        actor_user_id=current_user.id,
        external_id=req.client_id,
        payload={"content": req.summary, "kind": req.kind},
        occurred_at=utcnow(),
    )
    session.add(event)
    await session.flush()
    await session.refresh(event)
    return ContributionOut(event_id=str(event.id))
