"""LLMCall — cost/performance metadata only (no prompt/response text)."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from src.models.common import LLMStatus, LLMTrigger, TimestampMixin, new_uuid, utcnow


class LLMCall(TimestampMixin, table=True):
    __tablename__ = "llm_calls"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    triggered_by: LLMTrigger = Field(max_length=30)
    triggered_by_id: uuid.UUID | None = Field(default=None)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    model: str = Field(max_length=100)
    tokens_in: int = Field(default=0)
    tokens_out: int = Field(default=0)
    cost_usd: float = Field(default=0.0)
    latency_ms: int = Field(default=0)
    status: LLMStatus = Field(default=LLMStatus.ok, max_length=20)
    created_at: datetime = Field(default_factory=utcnow)
