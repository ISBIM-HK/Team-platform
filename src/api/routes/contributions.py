"""Contribution ingest — local AI work → events_cache (source-agnostic).

POST /me/contributions: any client (MCP / CLI / hook / curl) with a PAT can
push a work summary. kind decides event_type; summary goes to payload JSONB.
GET  /me/contributions: list the caller's own contribution history.
"""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.api.deps import CurrentUser, DBSession, require_scope
from src.models.common import EventSource, EventType, NotificationKind, utcnow
from src.models.event_cache import EventCache
from src.models.notification import Notification
from src.models.project import Project
from src.repositories.project_repo import ProjectRepository

router = APIRouter(prefix="/me", tags=["contributions"])

_KIND_TO_EVENT_TYPE = {
    "commit": EventType.commit,
    "review": EventType.pr_reviewed,
}


class ContributionIn(BaseModel):
    summary: str = Field(max_length=2000)
    project_id: uuid.UUID | None = None
    kind: Literal["work", "commit", "note", "review", "deploy"] = "work"
    client_id: str | None = Field(None, max_length=500)

    repo: str | None = Field(None, max_length=200)
    branch: str | None = Field(None, max_length=200)
    sha: str | None = Field(None, pattern=r"^[0-9a-f]{7,40}$")
    files_changed: int | None = Field(None, ge=0)
    insertions: int | None = Field(None, ge=0)
    deletions: int | None = Field(None, ge=0)
    diff_summary: str | None = Field(None, max_length=4000)
    source_agent: str | None = Field(None, max_length=100)
    workspace_id: str | None = Field(None, max_length=500)
    local_run_id: str | None = Field(None, max_length=200)
    confidence: float | None = Field(None, ge=0, le=1)
    visibility: Literal["self", "project"] = "project"


class ContributionOut(BaseModel):
    event_id: str
    deduped: bool = False


class ContributionListItem(BaseModel):
    event_id: str
    project_id: str | None
    project_name: str | None
    kind: str
    summary: str
    occurred_at: datetime
    payload: dict

    model_config = {"from_attributes": True}


class ContributionListResponse(BaseModel):
    items: list[ContributionListItem]
    total: int


_PAYLOAD_FIELDS = (
    "repo",
    "branch",
    "sha",
    "files_changed",
    "insertions",
    "deletions",
    "diff_summary",
    "source_agent",
    "workspace_id",
    "local_run_id",
    "confidence",
)


@router.post("/contributions", response_model=ContributionOut, status_code=201)
async def contribute(
    req: ContributionIn,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("contributions:write")),
):
    if req.project_id:
        proj = await ProjectRepository(session).get_by_id(req.project_id)
        if not proj or proj.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.status != "active":
            raise HTTPException(status_code=422, detail="项目不可用,无法投送")

    if req.client_id:
        existing = (
            await session.execute(
                select(EventCache).where(
                    EventCache.tenant_id == current_user.tenant_id,
                    EventCache.source == EventSource.agent,
                    EventCache.external_id == req.client_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return ContributionOut(event_id=str(existing.id), deduped=True)

    payload: dict = {"content": req.summary, "kind": req.kind}
    for field in _PAYLOAD_FIELDS:
        val = getattr(req, field)
        if val is not None:
            payload[field] = val
    if req.visibility != "project":
        payload["visibility"] = req.visibility

    event = EventCache(
        tenant_id=current_user.tenant_id,
        project_id=req.project_id,
        source=EventSource.agent,
        event_type=_KIND_TO_EVENT_TYPE.get(req.kind, EventType.manual_log),
        actor_user_id=current_user.id,
        external_id=req.client_id,
        payload=payload,
        occurred_at=utcnow(),
    )
    session.add(event)
    await session.flush()
    await session.refresh(event)

    session.add(
        Notification(
            tenant_id=current_user.tenant_id,
            recipient_user_id=current_user.id,
            kind=NotificationKind.system,
            title=f"本地投送: {req.summary[:80]}",
            source_ref={"event_id": str(event.id), "kind": req.kind},
        )
    )

    return ContributionOut(event_id=str(event.id))


@router.get("/contributions", response_model=ContributionListResponse)
async def list_contributions(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("contributions:read")),
    project_id: uuid.UUID | None = Query(None),
    kind: str | None = Query(None),
    since: datetime | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    stmt = (
        select(EventCache)
        .where(EventCache.actor_user_id == current_user.id, EventCache.source == EventSource.agent)
        .order_by(EventCache.occurred_at.desc())
    )
    if project_id:
        stmt = stmt.where(EventCache.project_id == project_id)
    if kind:
        stmt = stmt.where(EventCache.payload["kind"].as_string() == kind)
    if since:
        stmt = stmt.where(EventCache.occurred_at >= since)
    total_stmt = select(EventCache.id).where(
        EventCache.actor_user_id == current_user.id, EventCache.source == EventSource.agent
    )
    if project_id:
        total_stmt = total_stmt.where(EventCache.project_id == project_id)
    if kind:
        total_stmt = total_stmt.where(EventCache.payload["kind"].as_string() == kind)
    if since:
        total_stmt = total_stmt.where(EventCache.occurred_at >= since)

    events = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    total = len((await session.execute(total_stmt)).scalars().all())

    project_names: dict[uuid.UUID, str] = {}
    for e in events:
        if e.project_id and e.project_id not in project_names:
            proj = await session.get(Project, e.project_id)
            project_names[e.project_id] = proj.name if proj else None

    items = [
        ContributionListItem(
            event_id=str(e.id),
            project_id=str(e.project_id) if e.project_id else None,
            project_name=project_names.get(e.project_id),
            kind=(e.payload or {}).get("kind", "work"),
            summary=(e.payload or {}).get("content", ""),
            occurred_at=e.occurred_at,
            payload=e.payload or {},
        )
        for e in events
    ]
    return ContributionListResponse(items=items, total=total)
