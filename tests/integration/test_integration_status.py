"""Integration rich status (IntegrationStatus) wired through sync (附录 6.1 / Integration 状态机)."""

import pytest

from src.capture.sync import FAILURE_DISABLE_THRESHOLD, sync_gitlab
from src.models.common import IntegrationProvider, IntegrationStatus
from src.models.integration import Integration
from src.models.tenant import Tenant
from src.models.user import User


async def _integ(session) -> Integration:
    t = Tenant(name="T")
    session.add(t)
    await session.flush()
    u = User(tenant_id=t.id, email="integ@example.com", display_name="I")
    session.add(u)
    await session.flush()
    integ = Integration(
        tenant_id=t.id,
        user_id=u.id,
        provider=IntegrationProvider.gitlab,
        credential={"enc": "x"},
        scope="",
        consecutive_failures=0,
    )
    session.add(integ)
    await session.flush()
    return integ


async def test_failures_go_error_then_disabled(session, monkeypatch):
    integ = await _integ(session)
    monkeypatch.setattr("src.capture.sync.decrypt_credential", lambda c: {"base_url": "x", "pat": "y"})

    async def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr("src.capture.sync.fetch_events", boom)

    for _ in range(FAILURE_DISABLE_THRESHOLD - 1):
        with pytest.raises(RuntimeError):
            await sync_gitlab(session, integ)
    assert integ.status == IntegrationStatus.error
    assert integ.enabled is True  # dual-write: not yet auto-disabled

    with pytest.raises(RuntimeError):
        await sync_gitlab(session, integ)
    assert integ.status == IntegrationStatus.disabled
    assert integ.enabled is False  # dual-write kept in sync


async def test_success_resets_to_active(session, monkeypatch):
    integ = await _integ(session)
    integ.consecutive_failures = 2
    integ.status = IntegrationStatus.error
    monkeypatch.setattr("src.capture.sync.decrypt_credential", lambda c: {"base_url": "x", "pat": "y"})

    async def empty(*a, **k):
        return []

    monkeypatch.setattr("src.capture.sync.fetch_events", empty)

    n = await sync_gitlab(session, integ)
    assert n == 0
    assert integ.status == IntegrationStatus.active
    assert integ.consecutive_failures == 0


async def test_expired_credential_sets_expired_status(session, monkeypatch):
    from datetime import timedelta

    from src.models.common import utcnow

    integ = await _integ(session)
    integ.expires_at = utcnow() - timedelta(days=1)  # already expired
    monkeypatch.setattr("src.capture.sync.decrypt_credential", lambda c: {"base_url": "x", "pat": "y"})

    async def empty(*a, **k):
        return []

    monkeypatch.setattr("src.capture.sync.fetch_events", empty)

    with pytest.raises(Exception):
        await sync_gitlab(session, integ)
    assert integ.status == IntegrationStatus.expired
