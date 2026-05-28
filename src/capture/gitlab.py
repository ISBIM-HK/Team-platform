"""GitLab capture adapter — on-demand pull of a user's activity via their PAT.

Uses GitLab REST v4 `GET /events?after=` with header `PRIVATE-TOKEN: <pat>`.
Returns the authenticated user's events (pushes / MR / issue / comments).
"""

from __future__ import annotations

from datetime import datetime

import httpx

from src.models.common import EventType


def map_event_type(ev: dict) -> EventType:
    """Map a GitLab event's action_name/target_type to our EventType."""
    action = (ev.get("action_name") or "").lower()
    target = ev.get("target_type") or ""
    if ev.get("push_data") or "pushed" in action:
        return EventType.commit
    if target == "MergeRequest":
        if "opened" in action:
            return EventType.pr_opened
        if "commented" in action or "approved" in action or "accepted" in action:
            return EventType.pr_reviewed
        return EventType.pr_opened
    if "commented" in action:
        return EventType.message
    return EventType.message


def parse_occurred_at(ev: dict) -> datetime:
    """GitLab created_at (ISO 8601, e.g. '2026-05-28T09:00:00.000Z') → naive UTC."""
    s = (ev.get("created_at") or "").replace("Z", "+00:00")
    return datetime.fromisoformat(s).replace(tzinfo=None)


async def fetch_events(base_url: str, pat: str, since: datetime, per_page: int = 100) -> list[dict]:
    """Fetch the PAT owner's events created after `since`."""
    url = base_url.rstrip("/") + "/api/v4/events"
    params = {"after": since.date().isoformat(), "per_page": min(per_page, 100), "sort": "desc"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, headers={"PRIVATE-TOKEN": pat}, params=params)
        resp.raise_for_status()
        return resp.json()
