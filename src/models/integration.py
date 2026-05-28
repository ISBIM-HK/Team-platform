"""Integration aggregate."""

import uuid
from datetime import datetime

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from src.models.common import IntegrationProvider, TimestampMixin, new_uuid, utcnow


class Integration(TimestampMixin, table=True):
    __tablename__ = "integrations"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    provider: IntegrationProvider = Field(max_length=50)
    credential: dict = Field(sa_column=Column(JSON))  # Fernet-encrypted
    scope: str = Field(default="", max_length=500)
    expires_at: datetime | None = Field(default=None)
    last_synced_at: datetime | None = Field(default=None)
    last_error: str | None = Field(default=None, max_length=1000)
    consecutive_failures: int = Field(default=0)
    sync_cursor: dict | None = Field(default=None, sa_column=Column(JSON))
    enabled: bool = Field(default=True)
