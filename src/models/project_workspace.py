"""ProjectWorkspace — per-project shared context (1:1 with Project).

Stores human-curated background, context, and current focus.
Progress/completion is NOT stored here — computed from tasks in real time.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid, utcnow


class ProjectWorkspace(TimestampMixin, table=True):
    __tablename__ = "project_workspaces"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", unique=True, index=True)
    background_md: str = Field(default="")
    context_md: str = Field(default="")
    current_focus_md: str = Field(default="")
    version: int = Field(default=1)
    updated_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    updated_at: datetime = Field(default_factory=utcnow)
