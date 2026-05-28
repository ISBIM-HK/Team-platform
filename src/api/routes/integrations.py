"""Integration routes — connect GitLab (PAT), list, sync-now."""

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from src.api.deps import CurrentUser, DBSession
from src.capture.sync import sync_gitlab
from src.core.crypto import encrypt_credential
from src.models.common import IntegrationProvider
from src.models.integration import Integration

router = APIRouter(prefix="/integrations", tags=["integrations"])


class GitlabConnectRequest(BaseModel):
    pat: str
    base_url: str


class IntegrationResponse(BaseModel):
    id: str
    provider: str
    enabled: bool
    last_synced_at: datetime | None
    last_error: str | None
    consecutive_failures: int


class SyncResponse(BaseModel):
    synced: int


async def _get_user_integration(session, user_id, provider) -> Integration | None:
    stmt = select(Integration).where(
        Integration.user_id == user_id, Integration.provider == provider
    )
    return (await session.execute(stmt)).scalar_one_or_none()


@router.post("/gitlab/connect", response_model=IntegrationResponse)
async def connect_gitlab(req: GitlabConnectRequest, current_user: CurrentUser, session: DBSession):
    """Store (encrypted) the user's GitLab PAT + base URL. Idempotent (re-connect updates)."""
    cred = encrypt_credential({"pat": req.pat, "base_url": req.base_url.rstrip("/")})
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.gitlab)
    if integ:
        integ.credential = cred
        integ.enabled = True
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
async def list_integrations(current_user: CurrentUser, session: DBSession):
    stmt = select(Integration).where(Integration.user_id == current_user.id)
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_response(i) for i in rows]


@router.post("/gitlab/sync-now", response_model=SyncResponse)
async def sync_now(current_user: CurrentUser, session: DBSession):
    integ = await _get_user_integration(session, current_user.id, IntegrationProvider.gitlab)
    if not integ or not integ.enabled:
        raise HTTPException(status_code=404, detail="No enabled GitLab integration")
    try:
        n = await sync_gitlab(session, integ)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitLab sync failed: {e}")
    return SyncResponse(synced=n)


def _to_response(i: Integration) -> IntegrationResponse:
    return IntegrationResponse(
        id=str(i.id),
        provider=i.provider.value,
        enabled=i.enabled,
        last_synced_at=i.last_synced_at,
        last_error=i.last_error,
        consecutive_failures=i.consecutive_failures,
    )
