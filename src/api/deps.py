"""FastAPI dependencies — session, current user, tenant, scope guards."""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_session
from src.core.security import hash_pat, read_session_token
from src.models.common import utcnow
from src.models.pat import PersonalAccessToken
from src.models.user import User
from src.repositories.user_repo import UserRepository

VALID_SCOPES = {
    "contributions:write",
    "contributions:read",
    "projects:read",
    "projects:write",
    "tasks:read",
    "tasks:write",
    "suggestions:read",
    "suggestions:write",
    "notifications:read",
    "notifications:write",
    "assistant:read",
    "assistant:write",
    "chat:read",
    "chat:write",
    "assistant:message",
    "tokens:manage",
    "admin",
    "users:read",
    "profile:read",
    "integrations:read",
    "integrations:write",
    "decompose",
    "brief",
    "pm",
    "events:read",
    "events:write",
    "*",
}


async def get_db() -> AsyncSession:
    """Override for FastAPI — yields an async session."""
    async for session in get_session():
        yield session


DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(request: Request, session: DBSession) -> User:
    """Resolve current user from a Bearer PAT (local tools) or the session cookie.

    Sets request.state.token_scopes for downstream scope guards."""
    repo = UserRepository(session)

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        raw = auth[7:].strip()
        stmt = select(PersonalAccessToken).where(PersonalAccessToken.token_hash == hash_pat(raw))
        pat = (await session.execute(stmt)).scalar_one_or_none()
        if not pat or (pat.expires_at and pat.expires_at < utcnow()):
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        pat.last_used_at = utcnow()
        session.add(pat)
        request.state.token_scopes = pat.scopes or ["*"]
        user = await repo.get_by_id(pat.user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id_str = read_session_token(token)
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session")
    request.state.token_scopes = ["*"]
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_scope(*all_needed: str):
    """ALL listed scopes must be present (AND)."""

    async def _check(request: Request):
        scopes = getattr(request.state, "token_scopes", [])
        if "*" in scopes:
            return
        for s in all_needed:
            if s not in scopes:
                raise HTTPException(status_code=403, detail=f"Token lacks scope: {s}")

    return _check


def require_any_scope(*any_of: str):
    """At least ONE of the listed scopes must be present (OR)."""

    async def _check(request: Request):
        scopes = set(getattr(request.state, "token_scopes", []))
        if "*" in scopes:
            return
        if not scopes & set(any_of):
            raise HTTPException(status_code=403, detail=f"Token lacks any of: {', '.join(any_of)}")

    return _check
