"""Report aggregate."""

import uuid
from datetime import date as Date
from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field

from src.models.common import ReportKind, TimestampMixin, new_uuid, utcnow


class Report(TimestampMixin, table=True):
    __tablename__ = "reports"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id", index=True)
    kind: ReportKind = Field(max_length=20)
    report_date: Date = Field()  # renamed from 'date' to avoid pydantic name clash
    content: dict = Field(sa_column=Column(JSON))
    raw_activities: dict | None = Field(default=None, sa_column=Column(JSON))
    model_used: str = Field(default="", max_length=100)
    generated_at: datetime = Field(default_factory=utcnow)
