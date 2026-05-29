"""ProjectMember — project-level membership + role (附录 K).

Enables project-level ACL: only members can see a project. Two roles:
'lead' (creator default; manages members + dispatch) and 'member'.
Global is_pm / is_admin act as a tenant super-permission above this table.
"""

import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from src.models.common import new_uuid, utcnow


class ProjectMember(SQLModel, table=True):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_member"),)

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    role: str = Field(default="member", max_length=20)  # 'lead' | 'member'
    added_at: datetime = Field(default_factory=utcnow)
