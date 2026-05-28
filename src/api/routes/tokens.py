"""Personal Access Token routes — /me/tokens (create / list / revoke)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select

from src.api.deps import CurrentUser, DBSession
from src.core.security import generate_pat
from src.models.pat import PersonalAccessToken

router = APIRouter(prefix="/me/tokens", tags=["tokens"])


class TokenCreate(BaseModel):
    name: str


class TokenCreated(BaseModel):
    id: str
    name: str
    token: str  # plaintext — shown ONCE
    created_at: datetime


class TokenInfo(BaseModel):
    id: str
    name: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None


@router.post("", response_model=TokenCreated, status_code=201)
async def create_token(req: TokenCreate, current_user: CurrentUser, session: DBSession):
    raw, token_hash = generate_pat()
    pat = PersonalAccessToken(
        tenant_id=current_user.tenant_id, user_id=current_user.id,
        name=req.name, token_hash=token_hash,
    )
    session.add(pat)
    await session.flush()
    await session.refresh(pat)
    return TokenCreated(id=str(pat.id), name=pat.name, token=raw, created_at=pat.created_at)


@router.get("", response_model=list[TokenInfo])
async def list_tokens(current_user: CurrentUser, session: DBSession):
    stmt = select(PersonalAccessToken).where(
        PersonalAccessToken.user_id == current_user.id
    ).order_by(PersonalAccessToken.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [
        TokenInfo(id=str(t.id), name=t.name, created_at=t.created_at,
                  last_used_at=t.last_used_at, expires_at=t.expires_at)
        for t in rows
    ]


@router.delete("/{token_id}", status_code=204)
async def revoke_token(token_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    stmt = select(PersonalAccessToken).where(
        PersonalAccessToken.id == token_id, PersonalAccessToken.user_id == current_user.id
    )
    pat = (await session.execute(stmt)).scalar_one_or_none()
    if not pat:
        raise HTTPException(status_code=404, detail="Token not found")
    await session.execute(delete(PersonalAccessToken).where(PersonalAccessToken.id == token_id))
