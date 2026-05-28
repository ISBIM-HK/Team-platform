"""ScheduledJob aggregate."""

import uuid
from datetime import datetime

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from src.models.common import JobStatus, JobType, TimestampMixin, new_uuid, utcnow


class ScheduledJob(TimestampMixin, table=True):
    __tablename__ = "scheduled_jobs"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    job_type: JobType = Field(max_length=30)
    schedule: str = Field(max_length=100)  # cron expression or ISO timestamp
    target_ref: dict | None = Field(default=None, sa_column=Column(JSON))
    created_by: uuid.UUID = Field(foreign_key="users.id")
    enabled: bool = Field(default=True)
    last_run_at: datetime | None = Field(default=None)
    next_run_at: datetime | None = Field(default=None)
    last_status: JobStatus | None = Field(default=None, max_length=20)
    consecutive_failures: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)
