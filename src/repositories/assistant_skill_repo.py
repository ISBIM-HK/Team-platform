"""AssistantSkill repository (附录 J.5) — instruction-bundle skills under a workspace."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import safe_flush
from src.models.assistant_skill import AssistantSkill
from src.models.common import utcnow


class AssistantSkillRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[AssistantSkill]:
        return list(
            (
                await self.session.execute(
                    select(AssistantSkill)
                    .where(AssistantSkill.workspace_id == workspace_id)
                    .order_by(AssistantSkill.created_at)
                )
            )
            .scalars()
            .all()
        )

    async def list_enabled(self, workspace_id: uuid.UUID) -> list[AssistantSkill]:
        return list(
            (
                await self.session.execute(
                    select(AssistantSkill)
                    .where(
                        AssistantSkill.workspace_id == workspace_id,
                        AssistantSkill.enabled.is_(True),
                    )
                    .order_by(AssistantSkill.created_at)
                )
            )
            .scalars()
            .all()
        )

    async def get(self, skill_id: uuid.UUID) -> AssistantSkill | None:
        return await self.session.get(AssistantSkill, skill_id)

    async def get_by_name(self, workspace_id: uuid.UUID, name: str) -> AssistantSkill | None:
        return (
            (
                await self.session.execute(
                    select(AssistantSkill).where(
                        AssistantSkill.workspace_id == workspace_id, AssistantSkill.name == name
                    )
                )
            )
            .scalars()
            .first()
        )

    async def create(self, skill: AssistantSkill) -> AssistantSkill:
        self.session.add(skill)
        await safe_flush(self.session)
        return skill

    async def update(self, skill: AssistantSkill, **fields) -> AssistantSkill:
        for key, value in fields.items():
            if value is not None:
                setattr(skill, key, value)
        skill.updated_at = utcnow()
        self.session.add(skill)
        await safe_flush(self.session)
        return skill

    async def delete(self, skill: AssistantSkill) -> None:
        await self.session.delete(skill)
        await safe_flush(self.session)
