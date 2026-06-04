"""Auth routes — register, login, logout, me."""

from fastapi import APIRouter, Depends, HTTPException, Response

from src.api.deps import CurrentUser, DBSession, require_scope
from src.core.config import get_settings
from src.core.jarvisbim import verify_credentials as jarvisbim_verify
from src.core.security import create_session_token, hash_password, verify_password
from src.models.common import utcnow
from src.models.tenant import Tenant
from src.models.user import User
from src.repositories.project_repo import ProjectRepository
from src.repositories.tenant_repo import TenantRepository
from src.repositories.user_repo import UserRepository
from src.schemas.auth import (
    LoginRequest,
    LoginResponse,
    ProxyLoginRequest,
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

    # Bootstrap: the first user in a tenant becomes admin + pm (附录 L)
    is_first = len(await user_repo.list_by_tenant(tenant.id)) == 0
    user = User(
        tenant_id=tenant.id,
        email=req.email,
        display_name=req.display_name,
        password_hash=hash_password(req.password),
        is_admin=is_first,
        is_pm=is_first,
    )
    await user_repo.create(user)

    # Each user gets their own "未分类" Inbox (per-user, respects project ACL 附录 K §7)
    await ProjectRepository(session).ensure_inbox(tenant.id, user.id)

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


@router.post("/proxy-login", response_model=LoginResponse)
async def proxy_login(req: ProxyLoginRequest, response: Response, session: DBSession):
    """Authenticate via JarvisBIM — verify credentials against their API,
    auto-provision a local user on first login, then issue our session cookie."""
    email = req.email.strip().lower()
    user_repo = UserRepository(session)
    existing = await user_repo.get_by_email(email)

    # Try local password first (for admin/pre-existing accounts)
    if existing and existing.password_hash and verify_password(req.password, existing.password_hash):
        existing.last_seen_at = utcnow()
        await user_repo.update(existing)
        await session.commit()
        token = create_session_token(str(existing.id))
        response.set_cookie(
            key="session_token", value=token, httponly=True,
            secure=get_settings().is_production, samesite="lax", max_age=7 * 86400,
        )
        return LoginResponse(
            user_id=str(existing.id), email=existing.email,
            display_name=existing.display_name, is_pm=existing.is_pm, is_admin=existing.is_admin,
        )

    # Then try JarvisBIM
    remote = await jarvisbim_verify(email, req.password)
    if not remote:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = existing
    if not user:
        tenant_repo = TenantRepository(session)
        settings = get_settings()
        tenant = await tenant_repo.get_by_name(settings.default_tenant_name)
        if not tenant:
            tenant = Tenant(name=settings.default_tenant_name)
            await tenant_repo.create(tenant)
        is_first = len(await user_repo.list_by_tenant(tenant.id)) == 0
        remote_user = remote.get("userData", {}) if isinstance(remote, dict) else {}
        display_name = (
            remote_user.get("userName")
            or remote_user.get("name")
            or req.email.split("@")[0]
        )
        user = User(
            tenant_id=tenant.id,
            email=req.email.strip().lower(),
            display_name=display_name,
            password_hash=None,
            is_admin=is_first,
            is_pm=is_first,
            last_seen_at=utcnow(),
        )
        await user_repo.create(user)
        await ProjectRepository(session).ensure_inbox(tenant.id, user.id)
    else:
        user.last_seen_at = utcnow()
        await user_repo.update(user)

    await session.commit()

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
async def me(current_user: CurrentUser, _scope: None = Depends(require_scope("profile:read"))):
    return current_user
