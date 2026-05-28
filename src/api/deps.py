"""FastAPI dependencies — session, current user, tenant."""

import uuid
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_session
from src.core.security import read_session_token
from src.models.user import User
from src.repositories.user_repo import UserRepository


async def get_db() -> AsyncSession:
    """Override for FastAPI — yields an async session."""
    async for session in get_session():
        yield session


DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(request: Request, session: DBSession) -> User:
    """Extract current user from session cookie."""
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

    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
