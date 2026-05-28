"""Suggestion request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from src.models.common import SuggestionStatus, SuggestionType


class SuggestionResponse(BaseModel):
    id: uuid.UUID
    suggestion_type: SuggestionType
    target_user_id: uuid.UUID | None
    target_ref: dict | None
    rationale: str
    confidence: float
    based_on_events: list | None
    status: SuggestionStatus
    handled_by: uuid.UUID | None
    handled_at: datetime | None
    reject_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SuggestionListResponse(BaseModel):
    items: list[SuggestionResponse]
    total: int


class RejectRequest(BaseModel):
    reason: str = ""


class AcceptResponse(BaseModel):
    suggestion_id: uuid.UUID
    status: str
    created_tasks: list[uuid.UUID] = []
    message: str
