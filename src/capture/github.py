"""GitHub capture adapter — on-demand pull of a user's activity via their PAT.

Uses GitHub REST v3 `GET /users/{user}/events` with header `Authorization: Bearer <pat>`.
Returns the authenticated user's events (pushes / PR / issue / comments).
"""

from __future__ import annotations

from datetime import datetime

import httpx

from src.models.common import EventType


def map_event_type(ev: dict) -> EventType:
    """Map a GitHub event type to our EventType."""
    t = ev.get("type", "")
    if t == "PushEvent":
        return EventType.commit
    if t == "PullRequestEvent":
        action = (ev.get("payload") or {}).get("action", "")
        if action == "opened":
            return EventType.pr_opened
        return EventType.pr_reviewed
    if t == "PullRequestReviewEvent":
        return EventType.pr_reviewed
    if t in ("IssueCommentEvent", "CommitCommentEvent", "PullRequestReviewCommentEvent"):
        return EventType.message
    if t == "IssuesEvent":
        return EventType.message
    return EventType.message


def parse_occurred_at(ev: dict) -> datetime:
    """GitHub created_at (ISO 8601) → naive UTC."""
    s = (ev.get("created_at") or "").replace("Z", "+00:00")
    return datetime.fromisoformat(s).replace(tzinfo=None)


async def fetch_events(pat: str, since: datetime, per_page: int = 100) -> list[dict]:
    """Fetch the PAT owner's events created after `since`."""
    url = "https://api.github.com/user/events"
    params = {"per_page": min(per_page, 100)}
    headers = {"Authorization": f"Bearer {pat}", "Accept": "application/vnd.github+json"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        events = resp.json()
    return [e for e in events if parse_occurred_at(e) >= since]
