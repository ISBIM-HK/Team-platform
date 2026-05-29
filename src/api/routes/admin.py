"""Admin routes (附录 L) — tenant role management. admin-only.

admin manages roles (is_pm / is_admin) only; never reads others' private content
(assistant workspace / chat stay owner-only, privacy floor §5).
"""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from src.api.deps import CurrentUser, DBSession
from src.models.user import User
from src.repositories.user_repo import UserRepository
from src.schemas.user import UserListResponse, UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(current_user) -> None:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")


class RolePatch(BaseModel):
    is_pm: bool | None = None
    is_admin: bool | None = None


async def _admin_count(session, tenant_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(User)
        .where(User.tenant_id == tenant_id, User.is_admin.is_(True))
    )
    return (await session.execute(stmt)).scalar_one()


@router.get("/users", response_model=UserListResponse)
async def list_users(current_user: CurrentUser, session: DBSession):
    _require_admin(current_user)
    users = await UserRepository(session).list_by_tenant(current_user.tenant_id)
    return UserListResponse(items=[UserResponse.model_validate(u) for u in users])


@router.patch("/users/{user_id}", response_model=UserResponse)
async def set_roles(
    user_id: uuid.UUID, req: RolePatch, current_user: CurrentUser, session: DBSession
):
    _require_admin(current_user)
    repo = UserRepository(session)
    target = await repo.get_by_id(user_id)
    if not target or target.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")

    # Never leave a tenant without an admin
    if req.is_admin is False and target.is_admin and await _admin_count(session, target.tenant_id) <= 1:
        raise HTTPException(status_code=422, detail="Cannot remove the last admin")

    if req.is_pm is not None:
        target.is_pm = req.is_pm
    if req.is_admin is not None:
        target.is_admin = req.is_admin
    await repo.update(target)
    return UserResponse.model_validate(target)
