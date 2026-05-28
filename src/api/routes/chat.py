"""Chat REST routes — session CRUD + message history."""

import uuid

from fastapi import APIRouter, HTTPException, Query

from src.api.deps import CurrentUser, DBSession
from src.repositories.chat_repo import ChatRepository
from src.schemas.chat import (
    ChatMessageListResponse,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionListResponse,
    ChatSessionResponse,
)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/sessions", response_model=ChatSessionListResponse)
async def list_sessions(current_user: CurrentUser, session: DBSession):
    repo = ChatRepository(session)
    sessions = await repo.list_sessions(current_user.id)
    return ChatSessionListResponse(
        items=[ChatSessionResponse.model_validate(s) for s in sessions]
    )


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
async def create_session(req: ChatSessionCreate, current_user: CurrentUser, session: DBSession):
    repo = ChatRepository(session)
    cs = await repo.create_session(current_user.id, current_user.tenant_id, req.title)
    return ChatSessionResponse.model_validate(cs)


@router.get("/sessions/{session_id}/messages", response_model=ChatMessageListResponse)
async def get_messages(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    limit: int = Query(50, ge=1, le=200),
):
    repo = ChatRepository(session)
    cs = await repo.get_session(session_id)
    if not cs or cs.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = await repo.get_messages(session_id, limit=limit)
    return ChatMessageListResponse(
        items=[ChatMessageResponse.model_validate(m) for m in messages]
    )
