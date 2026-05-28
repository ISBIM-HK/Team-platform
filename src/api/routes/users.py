"""User routes."""

from fastapi import APIRouter

from src.api.deps import CurrentUser, DBSession
from src.repositories.user_repo import UserRepository
from src.schemas.user import UserListResponse, UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=UserListResponse)
async def list_users(current_user: CurrentUser, session: DBSession):
    repo = UserRepository(session)
    users = await repo.list_by_tenant(current_user.tenant_id)
    return UserListResponse(items=[UserResponse.model_validate(u) for u in users])
