"""FastAPI dependencies — session, current user, tenant."""

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


async def get_db() -> AsyncSession:
    """Override for FastAPI — yields an async session."""
    async for session in get_session():
        yield session


DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(request: Request, session: DBSession) -> User:
    """Resolve current user from a Bearer PAT (local tools) or the session cookie."""
    repo = UserRepository(session)

    # 1. Bearer PAT (for CLI / MCP / local tools)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        raw = auth[7:].strip()
        stmt = select(PersonalAccessToken).where(PersonalAccessToken.token_hash == hash_pat(raw))
        pat = (await session.execute(stmt)).scalar_one_or_none()
        if not pat or (pat.expires_at and pat.expires_at < utcnow()):
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        pat.last_used_at = utcnow()
        session.add(pat)
        user = await repo.get_by_id(pat.user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    # 2. Session cookie (browser)
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
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
