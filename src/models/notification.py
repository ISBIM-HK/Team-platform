"""Notification aggregate."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field

from src.models.common import NotificationKind, TimestampMixin, new_uuid, utcnow


class Notification(TimestampMixin, table=True):
    __tablename__ = "notifications"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    recipient_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    kind: NotificationKind = Field(max_length=30)
    title: str = Field(max_length=500)
    body: str = Field(default="")
    source_ref: dict | None = Field(default=None, sa_column=Column(JSON))
    read_at: datetime | None = Field(default=None)
    pushed_channels: list | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
