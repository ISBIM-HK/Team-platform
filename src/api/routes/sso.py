"""SSO routes (附录 M) — generic OIDC login + callback. Coexists with email/password.

login → state+nonce cookies + 302 to IdP. callback → verify state, exchange code,
verify id_token, resolve_sso_user, set the same cookie session, 302 to /.
resolve_sso_user is pure DB logic (auto-provision / link) and is unit-tested.
"""

import secrets

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from src.api.deps import DBSession
from src.core import sso as oidc
from src.core.config import get_settings
from src.core.security import create_session_token
from src.models.common import utcnow
from src.models.tenant import Tenant
from src.models.user import User
from src.repositories.project_repo import ProjectRepository
from src.repositories.tenant_repo import TenantRepository
from src.repositories.user_repo import UserRepository

router = APIRouter(prefix="/auth/sso", tags=["auth"])

_STATE_COOKIE = "sso_state"
_NONCE_COOKIE = "sso_nonce"


def _require_enabled() -> None:
    if not get_settings().sso_enabled:
        raise HTTPException(status_code=404, detail="SSO not configured")


@router.get("/status")
async def sso_status():
    """Public — lets the login page decide whether to show the SSO / dev-login button."""
    s = get_settings()
    return {"enabled": s.sso_enabled, "dev_stub": s.sso_dev_stub and not s.is_production}


@router.get("/login")
async def sso_login():
    _require_enabled()
    settings = get_settings()
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    url = await oidc.build_authorize_url(state, nonce)
    resp = RedirectResponse(url, status_code=302)
    opts = dict(httponly=True, secure=settings.is_production, samesite="lax", max_age=600, path="/")
    resp.set_cookie(_STATE_COOKIE, state, **opts)
    resp.set_cookie(_NONCE_COOKIE, nonce, **opts)
    return resp


def _fail(reason: str) -> RedirectResponse:
    resp = RedirectResponse(f"/?sso_error={reason}", status_code=302)
    resp.delete_cookie(_STATE_COOKIE, path="/")
    resp.delete_cookie(_NONCE_COOKIE, path="/")
    return resp


@router.get("/callback")
async def sso_callback(
    request: Request, session: DBSession, code: str | None = None, state: str | None = None
):
    _require_enabled()
    settings = get_settings()
    cookie_state = request.cookies.get(_STATE_COOKIE)
    nonce = request.cookies.get(_NONCE_COOKIE)
    if not code or not state or not cookie_state or state != cookie_state:
        return _fail("state")

    try:
        tokens = await oidc.exchange_code(code)
        claims = await oidc.verify_id_token(tokens["id_token"], nonce or "")
    except Exception:
        return _fail("token")

    email = (claims.get("email") or "").lower()
    sub = claims.get("sub")
    name = claims.get("name") or (email.split("@")[0] if email else "")
    if not sub or not email:
        return _fail("claims")

    try:
        user = await resolve_sso_user(session, sub=sub, email=email, name=name)
    except PermissionError:
        return _fail("domain")
    await session.commit()

    token = create_session_token(str(user.id))
    resp = RedirectResponse("/", status_code=302)
    resp.set_cookie(
        "session_token", token, httponly=True, secure=settings.is_production,
        samesite="lax", max_age=7 * 86400,
    )
    resp.delete_cookie(_STATE_COOKIE, path="/")
    resp.delete_cookie(_NONCE_COOKIE, path="/")
    return resp


class _DevLoginRequest(BaseModel):
    email: str
    name: str | None = None


@router.post("/dev-login")
async def sso_dev_login(payload: _DevLoginRequest, session: DBSession):
    """LOCAL DEV ONLY — fake an SSO success: provision/login by email, skipping the
    OIDC handshake entirely. Reuses resolve_sso_user so开户/会话与真 SSO 完全一致.

    Hard 404 in production (defense in depth — startup also fail-fasts on the flag)."""
    settings = get_settings()
    if settings.is_production or not settings.sso_dev_stub:
        raise HTTPException(status_code=404, detail="Not found")

    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="valid email required")
    name = (payload.name or "").strip() or email.split("@")[0]

    try:
        user = await resolve_sso_user(session, sub=f"devstub:{email}", email=email, name=name)
    except PermissionError:
        raise HTTPException(status_code=403, detail="email domain not allowed") from None
    await session.commit()

    resp = JSONResponse({"ok": True})
    resp.set_cookie(
        "session_token", create_session_token(str(user.id)), httponly=True,
        secure=settings.is_production, samesite="lax", max_age=7 * 86400,
    )
    return resp


async def resolve_sso_user(session, *, sub: str, email: str, name: str) -> User:
    """Map verified OIDC claims to a User (附录 M §2). Pure DB logic, unit-testable.

    Order: by sso_subject → by email (link) → auto-provision if domain allowed → reject.
    Raises PermissionError when the email domain isn't in ALLOWED_EMAIL_DOMAINS.
    """
    settings = get_settings()
    urepo = UserRepository(session)

    # 1. known sso_subject
    user = await urepo.get_by_sso_subject(sub)
    if user:
        user.last_seen_at = utcnow()
        await urepo.update(user)
        return user

    # 2. existing email account → link the subject
    user = await urepo.get_by_email(email)
    if user:
        user.sso_subject = sub
        user.last_seen_at = utcnow()
        await urepo.update(user)
        return user

    # 3. auto-provision if the domain is allowed
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    if domain not in settings.allowed_domains:
        raise PermissionError("email domain not allowed")

    trepo = TenantRepository(session)
    tenant = await trepo.get_by_name(settings.default_tenant_name)
    if not tenant:
        tenant = Tenant(name=settings.default_tenant_name)
        await trepo.create(tenant)
    # Role bootstrap mirrors auth.register: first user in the tenant → admin+pm (附录 L)
    is_first = len(await urepo.list_by_tenant(tenant.id)) == 0
    user = User(
        tenant_id=tenant.id,
        email=email,
        display_name=name or email.split("@")[0],
        password_hash=None,
        sso_subject=sub,
        is_admin=is_first,
        is_pm=is_first,
        last_seen_at=utcnow(),
    )
    await urepo.create(user)
    await ProjectRepository(session).ensure_inbox(tenant.id, user.id)
    return user
