"""WebSocket chat endpoint.

Protocol (matches design doc §B.3):
  Client → Server:
    {"type": "user_message", "content": "今天干了啥"}
    {"type": "abort"}
    {"type": "ping"}

  Server → Client:
    {"type": "assistant_token", "delta": "今"}
    {"type": "tool_call", "tool": "query_my_activity", "args": {...}}
    {"type": "tool_result", "call_id": "c1", "result": {...}}
    {"type": "assistant_done", "message_id": "uuid", "tokens": {...}}
    {"type": "suggestion_created", "suggestion": {...}}
    {"type": "error", "message": "..."}
"""

import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from src.ai.assistant import AssistantDeps, chat_turn
from src.ai.usage import RecordCtx
from src.core.database import async_session_factory
from src.core.security import read_session_token
from src.models.common import ChatRole, LLMTrigger
from src.repositories.chat_repo import ChatRepository
from src.repositories.user_repo import UserRepository

router = APIRouter(tags=["ws"])


async def _authenticate_ws(websocket: WebSocket) -> tuple | None:
    """Extract user from session cookie in WebSocket handshake. Returns (user, session) or None."""
    token = websocket.cookies.get("session_token")
    if not token:
        return None

    user_id_str = read_session_token(token)
    if not user_id_str:
        return None

    async with async_session_factory() as session:
        repo = UserRepository(session)
        user = await repo.get_by_id(uuid.UUID(user_id_str))
        if not user:
            return None
        return user


@router.websocket("/ws/chat/{session_id}")
async def ws_chat(websocket: WebSocket, session_id: uuid.UUID):
    """WebSocket endpoint for real-time chat with the personal AI assistant."""
    await websocket.accept()

    # Authenticate
    user = await _authenticate_ws(websocket)
    if not user:
        await websocket.send_json({"type": "error", "message": "Not authenticated"})
        await websocket.close()
        return

    # Verify session ownership
    async with async_session_factory() as db:
        chat_repo = ChatRepository(db)
        cs = await chat_repo.get_session(session_id)
        if not cs or cs.user_id != user.id:
            await websocket.send_json({"type": "error", "message": "Session not found"})
            await websocket.close()
            return

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type == "abort":
                # TODO: implement abort signal for in-flight generation
                await websocket.send_json({"type": "aborted"})
                continue

            if msg_type != "user_message":
                await websocket.send_json({"type": "error", "message": f"Unknown type: {msg_type}"})
                continue

            content = data.get("content", "").strip()
            if not content:
                continue

            # Process the message (optional current project context for tools, 附录 I.1)
            await _handle_user_message(websocket, session_id, user, content, data.get("project_id"))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


async def _handle_user_message(
    websocket: WebSocket,
    session_id: uuid.UUID,
    user,
    content: str,
    project_id: str | None = None,
):
    """Process one user message: save → call AI → stream response → save."""
    async with async_session_factory() as db:
        chat_repo = ChatRepository(db)

        # Save user message
        await chat_repo.add_message(
            session_id=session_id,
            tenant_id=user.tenant_id,
            role=ChatRole.user,
            content=content,
        )

        # Get conversation history for context
        history = await chat_repo.get_context_messages(session_id, limit=20)

        # Prepare deps — validate project membership before trusting frontend project_id
        current_pid = None
        if project_id:
            try:
                pid_candidate = uuid.UUID(project_id)
                from src.repositories.project_member_repo import ProjectMemberRepository

                role = await ProjectMemberRepository(db).role_of(pid_candidate, user.id)
                if role is not None or user.is_pm or user.is_admin:
                    current_pid = pid_candidate
            except ValueError:
                pass
        deps = AssistantDeps(
            session=db,
            user_id=user.id,
            tenant_id=user.tenant_id,
            current_project_id=current_pid,
        )

        # Load user's model preference
        from src.repositories.assistant_repo import AssistantWorkspaceRepository

        aws = await AssistantWorkspaceRepository(db).ensure(user.tenant_id, user.id)
        user_model = aws.llm_model if aws.llm_model else None

        # Call AI (record cost to llm_calls)
        rec = RecordCtx(
            session=db, tenant_id=user.tenant_id, user_id=user.id, trigger=LLMTrigger.chat, triggered_by_id=session_id
        )
        try:
            response_text = await chat_turn(content, history, deps, record=rec, user_model=user_model)
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"AI error: {e}"})
            return

        # Save assistant message
        msg = await chat_repo.add_message(
            session_id=session_id,
            tenant_id=user.tenant_id,
            role=ChatRole.assistant,
            content=response_text,
        )

        # Auto-title: use first user message as session title
        cs = await chat_repo.get_session(session_id)
        if cs and not cs.title:
            summary = content.strip().replace("\n", " ")
            if len(summary) > 30:
                summary = summary[:30] + "…"
            cs.title = summary
            db.add(cs)

        # Persist everything (user msg + tool side-effects + assistant msg).
        # async_session_factory() does NOT auto-commit on exit, so commit explicitly.
        await db.commit()

        # Send response to client
        await websocket.send_json(
            {
                "type": "assistant_done",
                "message_id": str(msg.id),
                "content": response_text,
            }
        )
