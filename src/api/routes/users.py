"""User routes."""

from fastapi import APIRouter, Depends

from src.api.deps import CurrentUser, DBSession, require_scope
from src.repositories.user_repo import UserRepository
from src.schemas.user import UserListResponse, UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("users:read")),
):
    repo = UserRepository(session)
    users = await repo.list_by_tenant(current_user.tenant_id)
    return UserListResponse(items=[UserResponse.model_validate(u) for u in users])
