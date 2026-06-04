"""DingTalk capture adapter — on-demand pull via DingTalk Open API.

Uses AppKey + AppSecret to get access_token, then pulls attendance/messages.
Requires a DingTalk self-built app (自建应用) with appropriate permissions.

MVP: basic framework. Full implementation needs enterprise app registration
with specific API permissions (考勤, 工作通知, etc.).
"""

from __future__ import annotations

from datetime import datetime

import httpx

from src.models.common import EventType

_TOKEN_URL = "https://oapi.dingtalk.com/gettoken"


async def get_access_token(app_key: str, app_secret: str) -> str:
    """Get DingTalk corp access token."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(_TOKEN_URL, params={"appkey": app_key, "appsecret": app_secret})
        resp.raise_for_status()
        data = resp.json()
    if data.get("errcode") != 0:
        raise RuntimeError(f"DingTalk token error: {data.get('errmsg', 'unknown')}")
    return data["access_token"]


def map_event_type(ev: dict) -> EventType:
    """Map DingTalk event to our EventType."""
    return EventType.message


def parse_occurred_at(ev: dict) -> datetime:
    """DingTalk timestamps are milliseconds since epoch."""
    ts = ev.get("create_time") or ev.get("timestamp") or 0
    if isinstance(ts, str):
        ts = int(ts)
    if ts > 1e12:
        ts = ts / 1000
    return datetime.utcfromtimestamp(max(ts, 0))


async def fetch_events(app_key: str, app_secret: str, user_id: str, since: datetime) -> list[dict]:
    """Fetch user's recent work events from DingTalk.

    MVP placeholder — returns empty list. Full implementation requires:
    1. Enterprise app with 考勤/日志/审批 permissions
    2. User's DingTalk userId (mapped from platform user)
    3. Multiple API calls for different data types
    """
    # Verify credentials work
    await get_access_token(app_key, app_secret)
    return []
