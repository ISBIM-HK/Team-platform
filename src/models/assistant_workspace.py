"""AssistantWorkspace aggregate — per-user persistent assistant context (附录 J).

One row per user: persona (SOUL), memory (MEMORY), user profile (USER) — three
markdown docs, owner-only. Single assistant; NOT a multi-agent/profile system.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid, utcnow


class AssistantWorkspace(TimestampMixin, table=True):
    __tablename__ = "assistant_workspaces"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    persona_md: str = Field(default="")  # SOUL — user-editable persona/system prompt
    memory_md: str = Field(default="")  # MEMORY — assistant-accumulated, tool-written
    profile_md: str = Field(default="")  # USER — what the assistant knows about the user
    updated_at: datetime = Field(default_factory=utcnow)
