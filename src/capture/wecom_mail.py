"""WeCom Mail (企业微信邮箱) capture adapter — pull recent emails via IMAP.

Each user configures their own email + app password.
Default IMAP server: imap.exmail.qq.com:993 (SSL).
"""

from __future__ import annotations

import email
import email.header
import imaplib
from datetime import datetime

from src.models.common import EventType

DEFAULT_IMAP_HOST = "imap.exmail.qq.com"
DEFAULT_IMAP_PORT = 993


def _decode_header(raw: str) -> str:
    parts = email.header.decode_header(raw or "")
    decoded = []
    for data, charset in parts:
        if isinstance(data, bytes):
            decoded.append(data.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(str(data))
    return " ".join(decoded)


def map_event_type(msg: dict) -> EventType:
    return EventType.message


def parse_occurred_at(date_str: str) -> datetime:
    """Parse email Date header to naive UTC datetime."""
    from email.utils import parsedate_to_datetime

    try:
        dt = parsedate_to_datetime(date_str)
        return dt.replace(tzinfo=None)
    except Exception:
        return datetime.utcnow()


def fetch_emails(
    host: str,
    port: int,
    email_addr: str,
    password: str,
    since: datetime,
    max_count: int = 50,
) -> list[dict]:
    """Fetch recent emails via IMAP. Returns list of {id, subject, from, date, snippet}."""
    imap = imaplib.IMAP4_SSL(host, port)
    try:
        imap.login(email_addr, password)
        imap.select("INBOX", readonly=True)

        since_str = since.strftime("%d-%b-%Y")
        _, msg_nums = imap.search(None, f'(SINCE "{since_str}")')
        ids = msg_nums[0].split()
        if not ids:
            return []

        ids = ids[-max_count:]
        results = []
        for mid in ids:
            _, data = imap.fetch(mid, "(RFC822.HEADER)")
            if not data or not data[0]:
                continue
            raw = data[0][1] if isinstance(data[0], tuple) else data[0]
            msg = email.message_from_bytes(raw)
            subject = _decode_header(msg.get("Subject", ""))
            from_addr = _decode_header(msg.get("From", ""))
            date_str = msg.get("Date", "")
            results.append(
                {
                    "id": mid.decode() if isinstance(mid, bytes) else str(mid),
                    "subject": subject,
                    "from": from_addr,
                    "date": date_str,
                    "occurred_at": parse_occurred_at(date_str).isoformat(),
                }
            )
        return results
    finally:
        try:
            imap.logout()
        except Exception:
            pass
