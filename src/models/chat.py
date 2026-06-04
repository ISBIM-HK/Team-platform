"""ChatSession / ChatMessage aggregate."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from src.models.common import ChatRole, TimestampMixin, new_uuid, utcnow


class ChatSession(TimestampMixin, table=True):
    __tablename__ = "chat_sessions"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    title: str | None = Field(default=None, max_length=500)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    last_active_at: datetime = Field(default_factory=utcnow)
    archived_at: datetime | None = Field(default=None)


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    session_id: uuid.UUID = Field(foreign_key="chat_sessions.id", index=True)
    role: ChatRole = Field(max_length=20)
    content: str = Field()
    tool_calls: dict | None = Field(default=None, sa_column=Column(JSON))
    model: str | None = Field(default=None, max_length=100)
    tokens_in: int | None = Field(default=None)
    tokens_out: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
