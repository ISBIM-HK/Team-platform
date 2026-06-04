"""In-process SSE notification bus.

Single-process MVP: dict of user_id → set[asyncio.Queue].
Each SSE connection registers a queue; NotificationService signals after commit.
"""

import asyncio
import uuid
from collections import defaultdict

_subscribers: dict[uuid.UUID, set[asyncio.Queue]] = defaultdict(set)


def subscribe(user_id: uuid.UUID) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers[user_id].add(q)
    return q


def unsubscribe(user_id: uuid.UUID, q: asyncio.Queue) -> None:
    _subscribers[user_id].discard(q)
    if not _subscribers[user_id]:
        del _subscribers[user_id]


def notify(user_id: uuid.UUID, data: dict) -> None:
    for q in _subscribers.get(user_id, set()):
        q.put_nowait(data)


def notify_many(user_ids: list[uuid.UUID], data: dict) -> None:
    for uid in user_ids:
        notify(uid, data)
