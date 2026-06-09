"""Org group hierarchy — tree-structured departments/teams."""

import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid


class OrgGroup(TimestampMixin, table=True):
    __tablename__ = "org_groups"
    __table_args__ = (UniqueConstraint("tenant_id", "parent_group_id", "name", name="uq_org_group_name"),)

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=255)
    parent_group_id: uuid.UUID | None = Field(default=None, foreign_key="org_groups.id", index=True)
    description: str = Field(default="")
    sort_order: int = Field(default=0)
    archived_at: datetime | None = Field(default=None)
    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")


class OrgGroupMember(TimestampMixin, table=True):
    __tablename__ = "org_group_members"
    __table_args__ = (UniqueConstraint("tenant_id", "group_id", "user_id", name="uq_org_group_member"),)

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    group_id: uuid.UUID = Field(foreign_key="org_groups.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
