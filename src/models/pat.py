"""Personal Access Token — for local tools / CLI / MCP (Bearer auth).

Only the SHA-256 hash is stored; the plaintext token is shown once at creation.
Scoped: each token carries a list of allowed scopes; `["*"]` = full access.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid, utcnow


class PersonalAccessToken(TimestampMixin, table=True):
    __tablename__ = "personal_access_tokens"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    token_hash: str = Field(max_length=64, unique=True, index=True)
    scopes: list[str] = Field(
        default_factory=lambda: ["*"],
        sa_column=Column(ARRAY(String), nullable=False, server_default="{*}"),
    )
    agent_name: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    expires_at: datetime | None = Field(default=None)
    last_used_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
