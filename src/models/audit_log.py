"""AuditLog aggregate — append-only."""

import uuid
from datetime import datetime

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from src.models.common import TimestampMixin, new_uuid, utcnow


class AuditLog(TimestampMixin, table=True):
    __tablename__ = "audit_logs"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    action: str = Field(max_length=100)
    actor_id: uuid.UUID = Field(foreign_key="users.id")
    target_type: str = Field(max_length=100)
    target_id: uuid.UUID
    detail: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
