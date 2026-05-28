"""Tenant aggregate."""

import uuid
from datetime import datetime

from sqlmodel import Field

from src.models.common import TimestampMixin, new_uuid, utcnow


class Tenant(TimestampMixin, table=True):
    __tablename__ = "tenants"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    name: str = Field(max_length=255, unique=True, index=True)
    created_at: datetime = Field(default_factory=utcnow)
