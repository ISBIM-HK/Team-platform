"""AssistantWorkspace repository (附录 J) — per-user, owner-only, lazy-created."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.assistant_workspace import AssistantWorkspace
from src.models.common import utcnow

MEMORY_SOFT_CAP = 8000  # chars; beyond this the assistant is nudged to rewrite_memory


class AssistantWorkspaceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, user_id: uuid.UUID) -> AssistantWorkspace | None:
        return (
            await self.session.execute(select(AssistantWorkspace).where(AssistantWorkspace.user_id == user_id))
        ).scalar_one_or_none()

    async def ensure(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> AssistantWorkspace:
        ws = await self.get(user_id)
        if ws:
            return ws
        ws = AssistantWorkspace(tenant_id=tenant_id, user_id=user_id)
        self.session.add(ws)
        await self.session.flush()
        return ws

    async def patch(
        self,
        ws: AssistantWorkspace,
        *,
        persona_md: str | None = None,
        memory_md: str | None = None,
        profile_md: str | None = None,
    ) -> AssistantWorkspace:
        """Partial update — only provided fields change (附录 J.4)."""
        if persona_md is not None:
            ws.persona_md = persona_md
        if memory_md is not None:
            ws.memory_md = memory_md
        if profile_md is not None:
            ws.profile_md = profile_md
        ws.updated_at = utcnow()
        self.session.add(ws)
        await self.session.flush()
        return ws

    async def _append(
        self, ws: AssistantWorkspace, field: str, note: str, with_date: bool = False
    ) -> AssistantWorkspace:
        cur = getattr(ws, field) or ""
        prefix = f"[{utcnow().date()}] " if with_date else ""
        line = f"- {prefix}{note.strip()}"
        setattr(ws, field, (cur + "\n" + line).strip() if cur else line)
        ws.updated_at = utcnow()
        self.session.add(ws)
        await self.session.flush()
        return ws

    async def append_memory(self, ws: AssistantWorkspace, note: str) -> AssistantWorkspace:
        return await self._append(ws, "memory_md", note, with_date=True)

    async def append_profile(self, ws: AssistantWorkspace, note: str) -> AssistantWorkspace:
        return await self._append(ws, "profile_md", note)
