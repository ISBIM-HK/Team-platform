"""AISuggestion repository."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.ai_suggestion import AISuggestion
from src.models.common import SuggestionStatus


class SuggestionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, suggestion_id: uuid.UUID) -> AISuggestion | None:
        return await self.session.get(AISuggestion, suggestion_id)

    async def list_by_user(
        self,
        user_id: uuid.UUID,
        status: SuggestionStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AISuggestion]:
        stmt = select(AISuggestion).where(
            AISuggestion.target_user_id == user_id,
            AISuggestion.confidence >= 0.6,  # 低置信度不展示（设计 §3.3）
        )
        if status:
            stmt = stmt.where(AISuggestion.status == status)
        stmt = stmt.order_by(AISuggestion.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_pending(
        self,
        tenant_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AISuggestion]:
        stmt = (
            select(AISuggestion)
            .where(AISuggestion.tenant_id == tenant_id)
            .where(AISuggestion.status == SuggestionStatus.pending)
            .where(AISuggestion.confidence >= 0.6)
            .order_by(AISuggestion.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, suggestion: AISuggestion) -> AISuggestion:
        self.session.add(suggestion)
        await self.session.flush()
        await self.session.refresh(suggestion)
        return suggestion

    async def accept(self, suggestion: AISuggestion, user_id: uuid.UUID) -> AISuggestion:
        suggestion.status = SuggestionStatus.accepted
        suggestion.handled_by = user_id
        suggestion.handled_at = datetime.now(UTC).replace(tzinfo=None)
        self.session.add(suggestion)
        await self.session.flush()
        await self.session.refresh(suggestion)
        return suggestion

    async def reject(
        self, suggestion: AISuggestion, user_id: uuid.UUID, reason: str = ""
    ) -> AISuggestion:
        suggestion.status = SuggestionStatus.rejected
        suggestion.handled_by = user_id
        suggestion.handled_at = datetime.now(UTC).replace(tzinfo=None)
        suggestion.reject_reason = reason
        self.session.add(suggestion)
        await self.session.flush()
        await self.session.refresh(suggestion)
        return suggestion
