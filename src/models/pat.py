"""Personal Access Token — for local tools / CLI / MCP (Bearer auth).

Only the SHA-256 hash is stored; the plaintext token is shown once at creation.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid, utcnow


class PersonalAccessToken(TimestampMixin, table=True):
    __tablename__ = "personal_access_tokens"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: uuid.UUID = Field(foreign_key="tenants.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    token_hash: str = Field(max_length=64, unique=True, index=True)  # sha256 hex
    expires_at: datetime | None = Field(default=None)
    last_used_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
