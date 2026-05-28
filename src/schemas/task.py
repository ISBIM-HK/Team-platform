"""Task request/response schemas."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from src.models.common import TaskPriority, TaskStatus


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: TaskPriority = TaskPriority.normal
    owner_user_id: uuid.UUID | None = None
    tags: list[str] | None = None
    due_date: date | None = None
    estimated_hours: float | None = None
    parent_task_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    owner_user_id: uuid.UUID | None = None
    tags: list[str] | None = None
    due_date: date | None = None
    estimated_hours: float | None = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    owner_user_id: uuid.UUID | None
    created_by: str
    tags: list[str] | None
    due_date: date | None
    estimated_hours: float | None
    parent_task_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    items: list[TaskResponse]
    total: int
