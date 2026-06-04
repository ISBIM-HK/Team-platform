"""Integration routes — connect GitLab/GitHub (PAT), list, sync-now."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from src.api.deps import CurrentUser, DBSession, require_scope
from src.capture.sync import sync_github, sync_gitlab, sync_wecom_mail
from src.core.crypto import encrypt_credential
from src.models.common import IntegrationProvider, IntegrationStatus
from src.models.integration import Integration

router = APIRouter(prefix="/integrations", tags=["integrations"])


class GitlabConnectRequest(BaseModel):
    pat: str
    base_url: str


class GithubConnectRequest(BaseModel):
    pat: str


class DingtalkConnectRequest(BaseModel):
    app_key: str
    app_secret: str


class WecomMailConnectRequest(BaseModel):
    email: str
    password: str
    host: str = "imap.exmail.qq.com"
    port: int = 993


class IntegrationResponse(BaseModel):
    id: str
    provider: str
    status: str
    enabled: bool
    last_synced_at: datetime | None
    last_error: str | None
    consecutive_failures: int


class SyncResponse(BaseModel):
    synced: int


async def _get_user_integration(session, user_id, provider) -> Integration | None:
    stmt = select(Integration).where(Integration.user_id == user_id, Integration.provider == provider)
    return (await session.execute(stmt)).scalar_one_or_none()


@router.post("/gitlab/connect", response_model=IntegrationResponse)
async def connect_gitlab(
    req: GitlabConnectRequest,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:write")),
):
    """Store (encrypted) the user's GitLab PAT + base URL. Idempotent (re-connect updates)."""
    cred = encrypt_credential({"pat": req.pat, "base_url": req.base_url.rstrip("/")})
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.gitlab)
    if integ:
        integ.credential = cred
        integ.enabled = True
        integ.status = IntegrationStatus.active
        integ.consecutive_failures = 0
        integ.last_error = None
    else:
        integ = Integration(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            provider=IntegrationProvider.gitlab,
            credential=cred,
            scope="read_api",
            enabled=True,
            consecutive_failures=0,
        )
    session.add(integ)
    await session.flush()
    await session.refresh(integ)
    return _to_response(integ)


@router.get("", response_model=list[IntegrationResponse])
async def list_integrations(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:read")),
):
    stmt = select(Integration).where(Integration.user_id == current_user.id)
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_response(i) for i in rows]


@router.post("/gitlab/sync-now", response_model=SyncResponse)
async def sync_now(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:write")),
):
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.gitlab)
    if not integ or not integ.enabled:
        raise HTTPException(status_code=404, detail="No enabled GitLab integration")
    try:
        n = await sync_gitlab(session, integ)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitLab sync failed: {e}")
    return SyncResponse(synced=n)


@router.post("/github/connect", response_model=IntegrationResponse)
async def connect_github(
    req: GithubConnectRequest,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:write")),
):
    """Store (encrypted) the user's GitHub PAT. Idempotent."""
    cred = encrypt_credential({"pat": req.pat})
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.github)
    if integ:
        integ.credential = cred
        integ.enabled = True
        integ.status = IntegrationStatus.active
        integ.consecutive_failures = 0
        integ.last_error = None
    else:
        integ = Integration(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            provider=IntegrationProvider.github,
            credential=cred,
            scope="repo,read:user",
            enabled=True,
            consecutive_failures=0,
        )
    session.add(integ)
    await session.flush()
    await session.refresh(integ)
    return _to_response(integ)


@router.post("/github/sync-now", response_model=SyncResponse)
async def github_sync_now(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:write")),
):
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.github)
    if not integ or not integ.enabled:
        raise HTTPException(status_code=404, detail="No enabled GitHub integration")
    try:
        n = await sync_github(session, integ)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub sync failed: {e}")
    return SyncResponse(synced=n)


@router.post("/dingtalk/connect", response_model=IntegrationResponse)
async def connect_dingtalk(
    req: DingtalkConnectRequest,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:write")),
):
    """Store encrypted DingTalk AppKey + AppSecret. Verifies credentials on connect."""
    from src.capture.dingtalk import get_access_token

    try:
        await get_access_token(req.app_key, req.app_secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DingTalk credential invalid: {e}")

    cred = encrypt_credential({"app_key": req.app_key, "app_secret": req.app_secret})
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.dingtalk)
    if integ:
        integ.credential = cred
        integ.enabled = True
        integ.status = IntegrationStatus.active
        integ.consecutive_failures = 0
        integ.last_error = None
    else:
        integ = Integration(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            provider=IntegrationProvider.dingtalk,
            credential=cred,
            scope="attendance,message",
            enabled=True,
            consecutive_failures=0,
        )
    session.add(integ)
    await session.flush()
    await session.refresh(integ)
    return _to_response(integ)


@router.post("/wecom-mail/connect", response_model=IntegrationResponse)
async def connect_wecom_mail(
    req: WecomMailConnectRequest,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:write")),
):
    """Store encrypted WeCom Mail IMAP credentials. Tests login on connect."""
    import imaplib

    try:
        imap = imaplib.IMAP4_SSL(req.host, req.port)
        imap.login(req.email, req.password)
        imap.logout()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"IMAP login failed: {e}")

    cred = encrypt_credential({"email": req.email, "password": req.password, "host": req.host, "port": req.port})
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.wecom_mail)
    if integ:
        integ.credential = cred
        integ.enabled = True
        integ.status = IntegrationStatus.active
        integ.consecutive_failures = 0
        integ.last_error = None
    else:
        integ = Integration(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            provider=IntegrationProvider.wecom_mail,
            credential=cred,
            scope="imap",
            enabled=True,
            consecutive_failures=0,
        )
    session.add(integ)
    await session.flush()
    await session.refresh(integ)
    return _to_response(integ)


@router.post("/wecom-mail/sync-now", response_model=SyncResponse)
async def wecom_mail_sync_now(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("integrations:write")),
):
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.wecom_mail)
    if not integ or not integ.enabled:
        raise HTTPException(status_code=404, detail="No enabled WeCom Mail integration")
    try:
        n = await sync_wecom_mail(session, integ)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"WeCom Mail sync failed: {e}")
    return SyncResponse(synced=n)


def _to_response(i: Integration) -> IntegrationResponse:
    return IntegrationResponse(
        id=str(i.id),
        provider=i.provider.value,
        status=i.status.value,
        enabled=i.enabled,
        last_synced_at=i.last_synced_at,
        last_error=i.last_error,
        consecutive_failures=i.consecutive_failures,
    )
