"""Project aggregate — organizing dimension for tasks.

status stored as VARCHAR (app-layer enum validation), not a native PG enum,
to avoid the ALTER TYPE migration pain when values evolve.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid, utcnow

INBOX_NAME = "未分类"  # per-tenant default project name


class Project(TimestampMixin, table=True):
    __tablename__ = "projects"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=255)
    description: str = Field(default="")
    status: str = Field(default="active", max_length=20)  # 'active' | 'archived' | 'deleted'
    position: int = Field(default=0)
    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow)
