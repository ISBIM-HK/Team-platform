"""Cycle — time-boxed iteration (sprint) + task linkage."""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlmodel import Field, SQLModel

from src.models.common import new_uuid, utcnow


class Cycle(SQLModel, table=True):
    __tablename__ = "cycles"
    __table_args__ = (
        CheckConstraint("end_date > start_date", name="ck_cycle_dates"),
    )

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    name: str = Field(max_length=120)
    description: str | None = Field(default=None)
    status: str = Field(default="planned", max_length=20)
    start_date: date
    end_date: date
    created_by: uuid.UUID = Field(foreign_key="users.id")
    closed_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CycleTask(SQLModel, table=True):
    __tablename__ = "cycle_tasks"
    __table_args__ = (
        UniqueConstraint("cycle_id", "task_id", name="uq_cycle_task"),
    )

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    cycle_id: uuid.UUID = Field(foreign_key="cycles.id", index=True)
    task_id: uuid.UUID = Field(foreign_key="tasks.id", index=True)
    added_by: uuid.UUID = Field(foreign_key="users.id")
    added_at: datetime = Field(default_factory=utcnow)
    removed_at: datetime | None = Field(default=None)
