"""Chat request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class ChatSessionCreate(BaseModel):
    title: str | None = None
    project_id: uuid.UUID | None = None


class ChatSessionResponse(BaseModel):
    id: uuid.UUID
    title: str | None
    project_id: uuid.UUID | None
    created_at: datetime
    last_active_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionListResponse(BaseModel):
    items: list[ChatSessionResponse]


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    model: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageListResponse(BaseModel):
    items: list[ChatMessageResponse]
