"""AISuggestion repository."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import String, and_, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.models.ai_suggestion import AISuggestion
from src.models.common import SuggestionStatus
from src.models.project import Project
from src.models.task import Task


class SuggestionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def _with_active_project_refs(stmt):
        project_id_text = AISuggestion.target_ref.op("->>")("project_id")
        task_id_text = AISuggestion.target_ref.op("->>")("task_id")
        ref_project = aliased(Project)
        ref_task = aliased(Task)
        task_project = aliased(Project)
        return (
            stmt.outerjoin(
                ref_project,
                and_(
                    ref_project.tenant_id == AISuggestion.tenant_id,
                    cast(ref_project.id, String) == project_id_text,
                ),
            )
            .outerjoin(
                ref_task,
                and_(
                    ref_task.tenant_id == AISuggestion.tenant_id,
                    cast(ref_task.id, String) == task_id_text,
                ),
            )
            .outerjoin(
                task_project,
                and_(
                    task_project.tenant_id == AISuggestion.tenant_id,
                    task_project.id == ref_task.project_id,
                ),
            )
            .where(
                or_(project_id_text.is_(None), ref_project.id.is_(None), ref_project.status == "active"),
                or_(
                    task_id_text.is_(None),
                    ref_task.id.is_(None),
                    task_project.id.is_(None),
                    task_project.status == "active",
                ),
            )
        )

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
        if status == SuggestionStatus.pending:
            stmt = self._with_active_project_refs(stmt)
        stmt = stmt.order_by(AISuggestion.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_pending(
        self,
        tenant_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AISuggestion]:
        stmt = select(AISuggestion).where(
            AISuggestion.tenant_id == tenant_id,
            AISuggestion.status == SuggestionStatus.pending,
            AISuggestion.confidence >= 0.6,
        )
        stmt = self._with_active_project_refs(stmt)
        stmt = stmt.order_by(AISuggestion.created_at.desc()).limit(limit).offset(offset)
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

    async def reject(self, suggestion: AISuggestion, user_id: uuid.UUID, reason: str = "") -> AISuggestion:
        suggestion.status = SuggestionStatus.rejected
        suggestion.handled_by = user_id
        suggestion.handled_at = datetime.now(UTC).replace(tzinfo=None)
        suggestion.reject_reason = reason
        self.session.add(suggestion)
        await self.session.flush()
        await self.session.refresh(suggestion)
        return suggestion
