"""On-demand sync: pull a user's GitLab events → normalize → events_cache.

Append-only with dedup via (tenant_id, source, external_id). Tracks failures
on the integration (3 consecutive → auto-disable, per design §2.7).
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.capture.github import fetch_events as gh_fetch
from src.capture.github import map_event_type as gh_map
from src.capture.github import parse_occurred_at as gh_parse
from src.capture.gitlab import fetch_events, map_event_type, parse_occurred_at
from src.core.crypto import decrypt_credential
from src.models.common import EventSource, IntegrationStatus, utcnow
from src.models.event_cache import EventCache
from src.models.integration import Integration

FAILURE_DISABLE_THRESHOLD = 3


async def sync_gitlab(session: AsyncSession, integration: Integration, window_hours: int = 168) -> int:
    """Pull recent GitLab events for one integration; returns # new events stored."""
    # Expired credential → expired status (Integration 状态机), skip the pull.
    if integration.expires_at and integration.expires_at < utcnow():
        integration.status = IntegrationStatus.expired
        integration.last_error = "credential expired"
        session.add(integration)
        await session.flush()
        raise RuntimeError("GitLab credential expired")

    cred = decrypt_credential(integration.credential)
    since = utcnow() - timedelta(hours=window_hours)

    try:
        events = await fetch_events(cred["base_url"], cred["pat"], since)
    except Exception as e:
        integration.last_error = str(e)[:1000]
        integration.consecutive_failures += 1
        if integration.consecutive_failures >= FAILURE_DISABLE_THRESHOLD:
            integration.enabled = False  # dual-write
            integration.status = IntegrationStatus.disabled
        else:
            integration.status = IntegrationStatus.error
        session.add(integration)
        await session.flush()
        raise

    ext_ids = [str(e["id"]) for e in events if e.get("id") is not None]
    existing: set[str] = set()
    if ext_ids:
        rows = await session.execute(
            select(EventCache.external_id).where(
                EventCache.tenant_id == integration.tenant_id,
                EventCache.source == EventSource.gitlab,
                EventCache.external_id.in_(ext_ids),
            )
        )
        existing = {r[0] for r in rows}

    inserted = 0
    for ev in events:
        eid = str(ev.get("id"))
        if eid in existing:
            continue
        session.add(
            EventCache(
                tenant_id=integration.tenant_id,
                source=EventSource.gitlab,
                event_type=map_event_type(ev),
                actor_user_id=integration.user_id,
                external_id=eid,
                payload=ev,
                occurred_at=parse_occurred_at(ev),
            )
        )
        inserted += 1

    integration.last_synced_at = utcnow()
    integration.last_error = None
    integration.consecutive_failures = 0
    integration.status = IntegrationStatus.active
    session.add(integration)
    await session.flush()
    return inserted


async def sync_github(session: AsyncSession, integration: Integration, window_hours: int = 168) -> int:
    """Pull recent GitHub events for one integration; returns # new events stored."""
    if integration.expires_at and integration.expires_at < utcnow():
        integration.status = IntegrationStatus.expired
        integration.last_error = "credential expired"
        session.add(integration)
        await session.flush()
        raise RuntimeError("GitHub credential expired")

    cred = decrypt_credential(integration.credential)
    since = utcnow() - timedelta(hours=window_hours)

    try:
        events = await gh_fetch(cred["pat"], since)
    except Exception as e:
        integration.last_error = str(e)[:1000]
        integration.consecutive_failures += 1
        if integration.consecutive_failures >= FAILURE_DISABLE_THRESHOLD:
            integration.enabled = False
            integration.status = IntegrationStatus.disabled
        else:
            integration.status = IntegrationStatus.error
        session.add(integration)
        await session.flush()
        raise

    ext_ids = [str(e.get("id", "")) for e in events if e.get("id")]
    existing: set[str] = set()
    if ext_ids:
        rows = await session.execute(
            select(EventCache.external_id).where(
                EventCache.tenant_id == integration.tenant_id,
                EventCache.source == EventSource.github,
                EventCache.external_id.in_(ext_ids),
            )
        )
        existing = {r[0] for r in rows}

    inserted = 0
    for ev in events:
        eid = str(ev.get("id", ""))
        if not eid or eid in existing:
            continue
        session.add(
            EventCache(
                tenant_id=integration.tenant_id,
                source=EventSource.github,
                event_type=gh_map(ev),
                actor_user_id=integration.user_id,
                external_id=eid,
                payload=ev,
                occurred_at=gh_parse(ev),
            )
        )
        inserted += 1

    integration.last_synced_at = utcnow()
    integration.last_error = None
    integration.consecutive_failures = 0
    integration.status = IntegrationStatus.active
    session.add(integration)
    await session.flush()
    return inserted
