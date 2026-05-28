"""EventCache aggregate — append-only event store."""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel

from src.models.common import EventSource, EventType, TimestampMixin, new_uuid, utcnow


class EventCache(TimestampMixin, table=True):
    __tablename__ = "events_cache"
    __table_args__ = (
        UniqueConstraint("tenant_id", "source", "external_id", name="uq_event_dedupe"),
    )

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id", index=True)
    source: EventSource = Field(max_length=50, index=True)
    event_type: EventType = Field(max_length=50)
    actor_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    external_id: str | None = Field(default=None, max_length=500)
    payload: dict = Field(sa_column=Column(JSON))
    occurred_at: datetime = Field()
    ingested_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime = Field(default_factory=lambda: utcnow() + timedelta(days=90))
