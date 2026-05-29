"""AssistantSkill — instruction-bundle skill attached to a workspace (附录 J.5).

A skill is name + description + markdown instruction (no code execution). Enabled
skills are injected into the assistant's system prompt.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid, utcnow


class AssistantSkill(TimestampMixin, table=True):
    __tablename__ = "assistant_skills"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="assistant_workspaces.id", index=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=100)
    description: str = Field(default="", max_length=500)
    instruction_md: str = Field(default="")
    enabled: bool = Field(default=True)
    updated_at: datetime = Field(default_factory=utcnow)
