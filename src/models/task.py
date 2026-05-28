"""Task aggregate + sub-entities (TaskHistory, TaskLink)."""

import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from src.models.common import TaskPriority, TaskStatus, TimestampMixin, new_uuid, utcnow


class Task(TimestampMixin, table=True):
    __tablename__ = "tasks"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    title: str = Field(max_length=500)
    description: str = Field(default="")
    status: TaskStatus = Field(default=TaskStatus.todo, max_length=20, index=True)
    priority: TaskPriority = Field(default=TaskPriority.normal)
    owner_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    created_by: str = Field(max_length=255)  # 'user:<uuid>' or 'ai_auto:<reason>'
    source_event_id: uuid.UUID | None = Field(default=None, foreign_key="events_cache.id")
    parent_task_id: uuid.UUID | None = Field(default=None, foreign_key="tasks.id")
    tags: list | None = Field(default=None, sa_column=Column(JSON))
    due_date: date | None = Field(default=None)
    estimated_hours: float | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class TaskHistory(SQLModel, table=True):
    __tablename__ = "task_history"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="tasks.id", index=True)
    field_name: str = Field(max_length=100)
    old_value: str | None = Field(default=None)
    new_value: str | None = Field(default=None)
    changed_by: uuid.UUID = Field(foreign_key="users.id")
    changed_at: datetime = Field(default_factory=utcnow)


class TaskLink(SQLModel, table=True):
    __tablename__ = "task_links"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="tasks.id", index=True)
    link_type: str = Field(max_length=50)  # 'blocks' | 'relates_to' | 'duplicate_of'
    target_task_id: uuid.UUID = Field(foreign_key="tasks.id")
    created_at: datetime = Field(default_factory=utcnow)
