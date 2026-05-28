"""User aggregate."""

import uuid
from datetime import datetime

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from src.models.common import TimestampMixin, new_uuid, utcnow


class User(TimestampMixin, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    email: str = Field(max_length=320, unique=True, index=True)
    display_name: str = Field(max_length=255)
    password_hash: str | None = Field(default=None, max_length=255)
    sso_subject: str | None = Field(default=None, max_length=255)
    is_pm: bool = Field(default=False)
    is_admin: bool = Field(default=False)
    capture_preferences: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime | None = Field(default=None)
