"""Shared base classes and enums for all models."""

import secrets
import time
import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Return naive UTC datetime (PostgreSQL TIMESTAMP WITHOUT TIME ZONE compatible)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_uuid() -> uuid.UUID:
    """UUID v7 — time-ordered, sortable (RFC 9562).

    stdlib has no uuid7 (through 3.13), so build it inline:
    48-bit unix_ms | version(7) | 12-bit rand | variant(0b10) | 62-bit rand.
    """
    unix_ts_ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF  # 48 bits
    value = unix_ts_ms << 80
    value |= 0x7 << 76  # version 7
    value |= secrets.randbits(12) << 64  # rand_a
    value |= 0b10 << 62  # variant (RFC 4122/9562)
    value |= secrets.randbits(62)  # rand_b
    return uuid.UUID(int=value)


class TimestampMixin(SQLModel):
    """Common timestamp fields."""
    created_at: datetime = Field(default_factory=utcnow)


# ─── Enums ───

class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    blocked = "blocked"
    review = "review"
    done = "done"
    archived = "archived"


class TaskPriority(int, Enum):
    low = 0
    normal = 1
    high = 2
    urgent = 3


class SuggestionType(str, Enum):
    create_task = "create_task"
    decompose = "decompose"
    assign = "assign"
    merge_duplicates = "merge_duplicates"
    archive = "archive"
    flag_blocked = "flag_blocked"


class SuggestionStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"


class EventSource(str, Enum):
    gitlab = "gitlab"
    lark = "lark"
    dingtalk = "dingtalk"
    notion = "notion"
    wecom_mail = "wecom_mail"
    meeting = "meeting"
    user_chat = "user_chat"


class EventType(str, Enum):
    commit = "commit"
    pr_opened = "pr_opened"
    pr_reviewed = "pr_reviewed"
    message = "message"
    doc_edited = "doc_edited"
    meeting_summary = "meeting_summary"
    manual_log = "manual_log"


class IntegrationProvider(str, Enum):
    gitlab = "gitlab"
    lark = "lark"
    dingtalk = "dingtalk"
    notion = "notion"
    wecom_mail = "wecom_mail"


class IntegrationStatus(str, Enum):
    active = "active"
    disabled = "disabled"
    expired = "expired"
    error = "error"


class ReportKind(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class JobType(str, Enum):
    daily_report = "daily_report"
    weekly_report = "weekly_report"
    reminder = "reminder"
    meeting_notice = "meeting_notice"
    custom = "custom"


class JobStatus(str, Enum):
    ok = "ok"
    error = "error"
    skipped = "skipped"


class NotificationKind(str, Enum):
    reminder = "reminder"
    meeting_notice = "meeting_notice"
    report_ready = "report_ready"
    mentioned = "mentioned"
    pr_reviewed = "pr_reviewed"
    system = "system"


class LLMTrigger(str, Enum):
    chat = "chat"
    daily_report = "daily_report"
    weekly_report = "weekly_report"
    normalize = "normalize"
    dispatch = "dispatch"


class LLMStatus(str, Enum):
    ok = "ok"
    error = "error"
    budget_exceeded = "budget_exceeded"


class ChatRole(str, Enum):
    user = "user"
    assistant = "assistant"
    tool = "tool"
    system = "system"
