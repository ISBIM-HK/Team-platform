"""Saved view — user-defined task filter/sort/group presets."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from src.models.common import new_uuid, utcnow


class SavedView(SQLModel, table=True):
    __tablename__ = "saved_views"
    __table_args__ = (
        CheckConstraint("visibility != 'project' OR project_id IS NOT NULL", name="ck_shared_needs_project"),
    )

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id", index=True)
    owner_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=120)
    visibility: str = Field(default="private", max_length=10)
    resource_type: str = Field(default="tasks", max_length=20)
    config: dict = Field(sa_column=Column(JSONB, nullable=False))
    config_version: int = Field(default=1)
    position: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
