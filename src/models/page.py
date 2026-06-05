"""Page — project-scoped wiki/documentation pages with tree hierarchy."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from src.models.common import new_uuid, utcnow


class Page(SQLModel, table=True):
    __tablename__ = "pages"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    parent_page_id: uuid.UUID | None = Field(default=None, foreign_key="pages.id", index=True)
    title: str = Field(max_length=255)
    content_md: str = Field(default="")
    status: str = Field(default="active", max_length=20)
    position: int = Field(default=0)
    version: int = Field(default=1)
    created_by: uuid.UUID = Field(foreign_key="users.id")
    updated_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
