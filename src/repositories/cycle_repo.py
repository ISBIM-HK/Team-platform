"""Cycle repository — time-boxed iteration management."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import TaskStatus, utcnow
from src.models.cycle import Cycle, CycleTask
from src.models.task import Task


class CycleRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_by_project(self, tenant_id: uuid.UUID, project_id: uuid.UUID) -> list[Cycle]:
        stmt = (
            select(Cycle)
            .where(Cycle.tenant_id == tenant_id, Cycle.project_id == project_id)
            .order_by(Cycle.start_date.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, cycle_id: uuid.UUID) -> Cycle | None:
        return await self.session.get(Cycle, cycle_id)

    async def create(self, cycle: Cycle) -> Cycle:
        self.session.add(cycle)
        await self.session.flush()
        await self.session.refresh(cycle)
        return cycle

    async def update(self, cycle: Cycle) -> Cycle:
        cycle.updated_at = utcnow()
        self.session.add(cycle)
        await self.session.flush()
        await self.session.refresh(cycle)
        return cycle

    async def get_active_cycle(self, tenant_id: uuid.UUID, project_id: uuid.UUID) -> Cycle | None:
        stmt = select(Cycle).where(
            Cycle.tenant_id == tenant_id,
            Cycle.project_id == project_id,
            Cycle.status == "active",
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def add_task(self, cycle_task: CycleTask) -> CycleTask:
        self.session.add(cycle_task)
        await self.session.flush()
        await self.session.refresh(cycle_task)
        return cycle_task

    async def remove_task(self, cycle_id: uuid.UUID, task_id: uuid.UUID) -> None:
        stmt = select(CycleTask).where(
            CycleTask.cycle_id == cycle_id,
            CycleTask.task_id == task_id,
            CycleTask.removed_at.is_(None),
        )
        ct = (await self.session.execute(stmt)).scalars().first()
        if ct:
            ct.removed_at = utcnow()
            self.session.add(ct)
            await self.session.flush()

    async def get_cycle_tasks(self, cycle_id: uuid.UUID) -> list[Task]:
        stmt = (
            select(Task)
            .join(CycleTask, CycleTask.task_id == Task.id)
            .where(CycleTask.cycle_id == cycle_id, CycleTask.removed_at.is_(None))
            .order_by(Task.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def is_task_in_active_cycle(self, tenant_id: uuid.UUID, task_id: uuid.UUID) -> bool:
        """Check if a task is already in any planned or active cycle."""
        stmt = (
            select(func.count())
            .select_from(CycleTask)
            .join(Cycle, Cycle.id == CycleTask.cycle_id)
            .where(
                CycleTask.tenant_id == tenant_id,
                CycleTask.task_id == task_id,
                CycleTask.removed_at.is_(None),
                Cycle.status.in_(["planned", "active"]),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one() > 0

    async def get_cycle_stats(self, cycle_id: uuid.UUID) -> dict:
        """Return task counts by status for tasks in this cycle (excluding removed)."""
        stmt = (
            select(Task.status, func.count())
            .join(CycleTask, CycleTask.task_id == Task.id)
            .where(CycleTask.cycle_id == cycle_id, CycleTask.removed_at.is_(None))
            .group_by(Task.status)
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        counts = {row[0].value if hasattr(row[0], "value") else row[0]: row[1] for row in rows}
        total = sum(counts.values())
        completed = counts.get(TaskStatus.done.value, 0)
        in_progress = counts.get(TaskStatus.in_progress.value, 0)
        blocked = counts.get(TaskStatus.blocked.value, 0)
        todo = counts.get(TaskStatus.todo.value, 0)

        return {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "blocked": blocked,
            "todo": todo,
            "completion_pct": round(completed / total * 100, 1) if total else 0.0,
        }
