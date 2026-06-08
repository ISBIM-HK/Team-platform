"""Telegram Bot capture adapter — receive group messages via webhook.

Admin configures a bot token; the bot is added to group chats.
Messages mentioning the bot (or all messages if privacy mode is off)
are forwarded to the webhook and processed by AI.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

import httpx

from src.models.common import EventType

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}"


async def set_webhook(token: str, webhook_url: str, secret: str = "") -> dict:
    """Register webhook URL with Telegram."""
    url = TELEGRAM_API.format(token=token) + "/setWebhook"
    payload = {"url": webhook_url, "allowed_updates": ["message"]}
    if secret:
        payload["secret_token"] = secret
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        return r.json()


async def delete_webhook(token: str) -> dict:
    """Remove webhook from Telegram."""
    url = TELEGRAM_API.format(token=token) + "/deleteWebhook"
    async with httpx.AsyncClient() as client:
        r = await client.post(url)
        r.raise_for_status()
        return r.json()


async def get_bot_info(token: str) -> dict:
    """Get bot username and id to verify token is valid."""
    url = TELEGRAM_API.format(token=token) + "/getMe"
    async with httpx.AsyncClient() as client:
        r = await client.post(url)
        r.raise_for_status()
        data = r.json()
        if not data.get("ok"):
            raise ValueError(data.get("description", "Invalid bot token"))
        return data["result"]


async def send_message(token: str, chat_id: int, text: str, reply_to: int | None = None) -> dict:
    """Send a text message to a chat."""
    url = TELEGRAM_API.format(token=token) + "/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if reply_to:
        payload["reply_to_message_id"] = reply_to
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        return r.json()


def parse_update(update: dict) -> dict | None:
    """Extract relevant fields from a Telegram update. Returns None if not a text message."""
    msg = update.get("message")
    if not msg or not msg.get("text"):
        return None

    chat = msg.get("chat", {})
    sender = msg.get("from", {})
    return {
        "update_id": update.get("update_id"),
        "message_id": msg["message_id"],
        "chat_id": chat.get("id"),
        "chat_title": chat.get("title", ""),
        "chat_type": chat.get("type", ""),  # private, group, supergroup
        "sender_id": sender.get("id"),
        "sender_name": _format_name(sender),
        "sender_username": sender.get("username", ""),
        "text": msg["text"],
        "date": datetime.fromtimestamp(msg.get("date", 0), tz=timezone.utc),
        "entities": msg.get("entities", []),
    }


def is_bot_mentioned(parsed: dict, bot_username: str) -> bool:
    """Check if the bot was @mentioned in the message."""
    for entity in parsed.get("entities", []):
        if entity.get("type") == "mention":
            text = parsed["text"]
            offset = entity["offset"]
            length = entity["length"]
            mention = text[offset:offset + length].lstrip("@").lower()
            if mention == bot_username.lower():
                return True
    return False


def webhook_secret_token(bot_token: str) -> str:
    """Derive a secret_token for Telegram webhook verification from the bot token."""
    return hmac.new(b"onyx-tg", bot_token.encode(), hashlib.sha256).hexdigest()[:32]


def map_event_type(parsed: dict) -> EventType:
    return EventType.message


def _format_name(user: dict) -> str:
    parts = [user.get("first_name", ""), user.get("last_name", "")]
    return " ".join(p for p in parts if p) or user.get("username", "unknown")
