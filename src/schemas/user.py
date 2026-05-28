"""User response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    is_pm: bool
    is_admin: bool
    created_at: datetime
    last_seen_at: datetime | None

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    items: list[UserResponse]
