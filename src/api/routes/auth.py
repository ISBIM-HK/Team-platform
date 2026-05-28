"""Auth routes — register, login, logout, me."""

from fastapi import APIRouter, HTTPException, Response

from src.api.deps import CurrentUser, DBSession
from src.core.config import get_settings
from src.core.security import create_session_token, hash_password, verify_password
from src.models.tenant import Tenant
from src.models.user import User
from src.repositories.tenant_repo import TenantRepository
from src.repositories.user_repo import UserRepository
from src.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
)
from src.schemas.user import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse)
async def register(req: RegisterRequest, session: DBSession):
    settings = get_settings()
    user_repo = UserRepository(session)
    tenant_repo = TenantRepository(session)

    # Gate self-signup to company email domain(s)
    allowed = settings.allowed_domains
    if not allowed:
        raise HTTPException(status_code=403, detail="Self-registration is disabled")
    domain = req.email.rsplit("@", 1)[-1].lower() if "@" in req.email else ""
    if domain not in allowed:
        raise HTTPException(status_code=403, detail="Email domain not allowed")

    # Check email uniqueness
    existing = await user_repo.get_by_email(req.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # All self-registrants join the single company tenant (MVP: one tenant)
    tenant = await tenant_repo.get_by_name(settings.default_tenant_name)
    if not tenant:
        tenant = Tenant(name=settings.default_tenant_name)
        await tenant_repo.create(tenant)

    user = User(
        tenant_id=tenant.id,
        email=req.email,
        display_name=req.display_name,
        password_hash=hash_password(req.password),
    )
    await user_repo.create(user)

    return RegisterResponse(
        user_id=str(user.id),
        email=user.email,
        display_name=user.display_name,
    )


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, response: Response, session: DBSession):
    repo = UserRepository(session)
    user = await repo.get_by_email(req.email)
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_session_token(str(user.id))
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=get_settings().is_production,
        samesite="lax",
        max_age=7 * 86400,
    )

    return LoginResponse(
        user_id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        is_pm=user.is_pm,
        is_admin=user.is_admin,
    )


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session_token")
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUser):
    return current_user
