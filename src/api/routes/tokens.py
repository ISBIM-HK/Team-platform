"""Personal Access Token routes — /me/tokens (create / list / revoke).

Scoped: tokens carry a list of allowed scopes. Default is a safe minimal set
for local agents; `["*"]` (full access) requires explicit opt-in and can only
be created by a full-access caller (browser session or existing `*` token).
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from src.api.deps import VALID_SCOPES, CurrentUser, DBSession, require_scope
from src.core.security import generate_pat
from src.models.pat import PersonalAccessToken

router = APIRouter(prefix="/me/tokens", tags=["tokens"])

_DEFAULT_SCOPES = ["contributions:write", "contributions:read", "projects:read"]


class TokenCreate(BaseModel):
    name: str = Field(max_length=100)
    scopes: list[str] = Field(default_factory=lambda: list(_DEFAULT_SCOPES))
    agent_name: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=500)


class TokenCreated(BaseModel):
    id: str
    name: str
    scopes: list[str]
    agent_name: str | None
    token: str
    created_at: datetime


class TokenInfo(BaseModel):
    id: str
    name: str
    scopes: list[str]
    agent_name: str | None
    description: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None


@router.post("", response_model=TokenCreated, status_code=201)
async def create_token(
    req: TokenCreate,
    request: Request,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("tokens:manage")),
):
    if not req.scopes:
        raise HTTPException(status_code=422, detail="scopes must not be empty")
    invalid = set(req.scopes) - VALID_SCOPES
    if invalid:
        raise HTTPException(status_code=422, detail=f"Invalid scopes: {', '.join(sorted(invalid))}")
    caller_scopes = getattr(request.state, "token_scopes", [])
    if "*" in req.scopes and "*" not in caller_scopes:
        raise HTTPException(status_code=403, detail="Only full-access callers can create wildcard tokens")

    raw, token_hash = generate_pat()
    pat = PersonalAccessToken(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        name=req.name,
        token_hash=token_hash,
        scopes=req.scopes,
        agent_name=req.agent_name,
        description=req.description,
    )
    session.add(pat)
    await session.flush()
    await session.refresh(pat)
    return TokenCreated(
        id=str(pat.id),
        name=pat.name,
        scopes=pat.scopes,
        agent_name=pat.agent_name,
        token=raw,
        created_at=pat.created_at,
    )


@router.get("", response_model=list[TokenInfo])
async def list_tokens(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("tokens:manage")),
):
    stmt = (
        select(PersonalAccessToken)
        .where(PersonalAccessToken.user_id == current_user.id)
        .order_by(PersonalAccessToken.created_at.desc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        TokenInfo(
            id=str(t.id),
            name=t.name,
            scopes=t.scopes or ["*"],
            agent_name=t.agent_name,
            description=t.description,
            created_at=t.created_at,
            last_used_at=t.last_used_at,
            expires_at=t.expires_at,
        )
        for t in rows
    ]


@router.delete("/{token_id}", status_code=204)
async def revoke_token(
    token_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("tokens:manage")),
):
    stmt = select(PersonalAccessToken).where(
        PersonalAccessToken.id == token_id, PersonalAccessToken.user_id == current_user.id
    )
    pat = (await session.execute(stmt)).scalar_one_or_none()
    if not pat:
        raise HTTPException(status_code=404, detail="Token not found")
    await session.execute(delete(PersonalAccessToken).where(PersonalAccessToken.id == token_id))
