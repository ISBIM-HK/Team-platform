"""Task repository."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import TaskStatus, utcnow
from src.models.task import Task, TaskHistory


class TaskRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, task_id: uuid.UUID) -> Task | None:
        return await self.session.get(Task, task_id)

    async def list_by_tenant(
        self,
        tenant_id: uuid.UUID,
        status: TaskStatus | None = None,
        owner_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Task]:
        stmt = select(Task).where(Task.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Task.status == status)
        if owner_id:
            stmt = stmt.where(Task.owner_user_id == owner_id)
        stmt = stmt.order_by(Task.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_by_project(
        self, project_id: uuid.UUID, status: TaskStatus | None = None
    ) -> list[Task]:
        stmt = select(Task).where(Task.project_id == project_id)
        if status:
            stmt = stmt.where(Task.status == status)
        stmt = stmt.order_by(Task.created_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_tenant(
        self,
        tenant_id: uuid.UUID,
        status: TaskStatus | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(Task).where(Task.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Task.status == status)
        if owner_id:
            stmt = stmt.where(Task.owner_user_id == owner_id)
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def count_open_by_owner(self, tenant_id: uuid.UUID, owner_id: uuid.UUID) -> int:
        """Count a user's unfinished tasks (excludes done/archived) — used as dispatch load."""
        stmt = (
            select(func.count())
            .select_from(Task)
            .where(
                Task.tenant_id == tenant_id,
                Task.owner_user_id == owner_id,
                Task.status.notin_([TaskStatus.done, TaskStatus.archived]),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def has_children(self, task_id: uuid.UUID) -> bool:
        stmt = select(func.count()).select_from(Task).where(Task.parent_task_id == task_id)
        return (await self.session.execute(stmt)).scalar_one() > 0

    async def create(self, task: Task) -> Task:
        self.session.add(task)
        await self.session.flush()
        await self.session.refresh(task)
        return task

    async def update_status(
        self, task: Task, new_status: TaskStatus, changed_by: uuid.UUID
    ) -> Task:
        old_status = task.status
        task.status = new_status
        task.updated_at = utcnow()
        history = TaskHistory(
            task_id=task.id,
            field_name="status",
            old_value=old_status.value,
            new_value=new_status.value,
            changed_by=changed_by,
        )
        self.session.add(history)
        self.session.add(task)
        await self.session.flush()
        await self.session.refresh(task)
        return task

    async def claim_task(self, task_id: uuid.UUID, user_id: uuid.UUID) -> Task | None:
        """Pull-mode claim: optimistic lock on owner_user_id IS NULL."""
        stmt = (
            update(Task)
            .where(Task.id == task_id, Task.owner_user_id.is_(None))
            .values(owner_user_id=user_id, updated_at=utcnow())
            .returning(Task)
        )
        result = await self.session.execute(stmt)
        row = result.first()
        if row:
            await self.session.flush()
            return row[0]
        return None
