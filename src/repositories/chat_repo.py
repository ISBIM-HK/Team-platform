"""Chat repository — session + message CRUD."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.chat import ChatMessage, ChatSession
from src.models.common import ChatRole, utcnow


class ChatRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Sessions ──

    async def create_session(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        title: str | None = None,
        project_id: uuid.UUID | None = None,
    ) -> ChatSession:
        cs = ChatSession(tenant_id=tenant_id, user_id=user_id, title=title, project_id=project_id)
        self.session.add(cs)
        await self.session.flush()
        await self.session.refresh(cs)
        return cs

    async def get_session(self, session_id: uuid.UUID) -> ChatSession | None:
        return await self.session.get(ChatSession, session_id)

    async def list_sessions(self, user_id: uuid.UUID, limit: int = 20) -> list[ChatSession]:
        stmt = (
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .where(ChatSession.archived_at.is_(None))
            .order_by(ChatSession.last_active_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # ── Messages ──

    async def add_message(
        self,
        session_id: uuid.UUID,
        tenant_id: uuid.UUID,
        role: ChatRole,
        content: str,
        model: str | None = None,
        tool_calls: dict | None = None,
        tokens_in: int | None = None,
        tokens_out: int | None = None,
    ) -> ChatMessage:
        msg = ChatMessage(
            tenant_id=tenant_id,
            session_id=session_id,
            role=role,
            content=content,
            model=model,
            tool_calls=tool_calls,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        self.session.add(msg)
        # Update session last_active_at
        cs = await self.get_session(session_id)
        if cs:
            cs.last_active_at = utcnow()
            self.session.add(cs)
        await self.session.flush()
        await self.session.refresh(msg)
        return msg

    async def get_messages(self, session_id: uuid.UUID, limit: int = 50) -> list[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_context_messages(self, session_id: uuid.UUID, limit: int = 20) -> list[dict]:
        """Return recent messages as dicts suitable for LLM context."""
        messages = await self.get_messages(session_id, limit=limit)
        return [{"role": m.role.value, "content": m.content} for m in messages]
