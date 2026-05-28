"""AISuggestion aggregate."""

import uuid
from datetime import datetime

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from src.models.common import SuggestionStatus, SuggestionType, TimestampMixin, new_uuid, utcnow


class AISuggestion(TimestampMixin, table=True):
    __tablename__ = "ai_suggestions"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    suggestion_type: SuggestionType = Field(max_length=30)
    target_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    target_ref: dict | None = Field(default=None, sa_column=Column(JSON))
    rationale: str = Field()
    confidence: float = Field(ge=0.0, le=1.0)
    based_on_events: list | None = Field(default=None, sa_column=Column(JSON))
    status: SuggestionStatus = Field(default=SuggestionStatus.pending, max_length=20, index=True)
    handled_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    handled_at: datetime | None = Field(default=None)
    reject_reason: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
