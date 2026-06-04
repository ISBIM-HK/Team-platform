"""Chat REST routes — session CRUD + message history + REST message endpoint."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.api.deps import CurrentUser, DBSession, require_any_scope, require_scope
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
async def list_sessions(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("chat:read")),
):
    repo = ChatRepository(session)
    sessions = await repo.list_sessions(current_user.id)
    return ChatSessionListResponse(items=[ChatSessionResponse.model_validate(s) for s in sessions])


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
async def create_session(
    req: ChatSessionCreate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("chat:write")),
):
    repo = ChatRepository(session)
    cs = await repo.create_session(current_user.id, current_user.tenant_id, req.title, req.project_id)
    return ChatSessionResponse.model_validate(cs)


@router.get("/sessions/{session_id}/messages", response_model=ChatMessageListResponse)
async def get_messages(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("chat:read")),
    limit: int = Query(50, ge=1, le=200),
):
    repo = ChatRepository(session)
    cs = await repo.get_session(session_id)
    if not cs or cs.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = await repo.get_messages(session_id, limit=limit)
    return ChatMessageListResponse(items=[ChatMessageResponse.model_validate(m) for m in messages])


class ChatMessageRequest(BaseModel):
    content: str = Field(max_length=4000)
    session_id: uuid.UUID | None = None


class ChatMessageReply(BaseModel):
    reply: str
    session_id: str


_LOCAL_AGENT_SESSION_TITLE = "本地 Agent"


@router.post("/message", response_model=ChatMessageReply)
async def send_message(
    req: ChatMessageRequest,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("assistant:message", "chat:write")),
):
    """REST entry point for assistant chat — usable with PAT from local agents.

    Uses a restricted tool set (read-only) when called via scoped PAT to prevent
    privilege escalation through the assistant's tool chain.
    """
    from src.ai.assistant import chat_turn
    from src.ai.tools import AssistantDeps
    from src.ai.usage import RecordCtx
    from src.models.common import ChatRole, LLMTrigger

    repo = ChatRepository(session)

    if req.session_id:
        cs = await repo.get_session(req.session_id)
        if not cs or cs.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Session not found")
        sid = req.session_id
    else:
        sessions = await repo.list_sessions(current_user.id)
        local = next((s for s in sessions if s.title == _LOCAL_AGENT_SESSION_TITLE), None)
        if local:
            sid = local.id
        else:
            cs = await repo.create_session(current_user.id, current_user.tenant_id, _LOCAL_AGENT_SESSION_TITLE)
            sid = cs.id

    await repo.add_message(session_id=sid, tenant_id=current_user.tenant_id, role=ChatRole.user, content=req.content)
    history = await repo.get_context_messages(sid, limit=20)

    deps = AssistantDeps(session=session, user_id=current_user.id, tenant_id=current_user.tenant_id)
    rec = RecordCtx(
        session=session,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        trigger=LLMTrigger.chat,
        triggered_by_id=sid,
    )

    reply_text = await chat_turn(req.content, history, deps, record=rec, restricted=True)

    await repo.add_message(
        session_id=sid, tenant_id=current_user.tenant_id, role=ChatRole.assistant, content=reply_text
    )
    await session.commit()

    return ChatMessageReply(reply=reply_text, session_id=str(sid))
