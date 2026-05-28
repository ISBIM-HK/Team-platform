"""Tools available to the personal AI assistant.

Each tool is a function registered with PydanticAI.
Tools interact with the database via repositories.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from pydantic_ai import RunContext


@dataclass
class AssistantDeps:
    """Dependencies injected into tool functions at runtime."""
    session: object  # AsyncSession
    user_id: uuid.UUID
    tenant_id: uuid.UUID


async def query_my_tasks(ctx: RunContext[AssistantDeps], status: str = "") -> str:
    """查询当前用户的任务列表。可选按状态筛选：todo/in_progress/blocked/review/done。"""
    from src.models.common import TaskStatus
    from src.repositories.task_repo import TaskRepository

    repo = TaskRepository(ctx.deps.session)
    task_status = TaskStatus(status) if status else None
    tasks = await repo.list_by_tenant(
        ctx.deps.tenant_id,
        status=task_status,
        owner_id=ctx.deps.user_id,
        limit=20,
    )
    if not tasks:
        return "你当前没有任务。"

    lines = []
    for t in tasks:
        parent = " (子任务)" if t.parent_task_id else ""
        est = f" 预估{t.estimated_hours}h" if t.estimated_hours else ""
        lines.append(f"- [{t.status.value}] {t.title}{est}{parent}")
    return f"你有 {len(tasks)} 个任务：\n" + "\n".join(lines)


async def query_team_tasks(ctx: RunContext[AssistantDeps], status: str = "") -> str:
    """查询团队所有任务。可选按状态筛选。"""
    from src.models.common import TaskStatus
    from src.repositories.task_repo import TaskRepository

    repo = TaskRepository(ctx.deps.session)
    task_status = TaskStatus(status) if status else None
    tasks = await repo.list_by_tenant(
        ctx.deps.tenant_id, status=task_status, limit=50
    )
    if not tasks:
        return "团队当前没有任务。"

    lines = []
    for t in tasks:
        owner = f" @{t.owner_user_id}" if t.owner_user_id else " 未认领"
        lines.append(f"- [{t.status.value}] {t.title}{owner}")
    return f"团队共 {len(tasks)} 个任务：\n" + "\n".join(lines)


async def log_manual_work(ctx: RunContext[AssistantDeps], content: str) -> str:
    """手动记录一条工作内容，写入事件缓存。用于记录系统无法自动捕获的工作。"""
    from src.models.common import EventSource, EventType, utcnow
    from src.models.event_cache import EventCache

    event = EventCache(
        tenant_id=ctx.deps.tenant_id,
        source=EventSource.user_chat,
        event_type=EventType.manual_log,
        actor_user_id=ctx.deps.user_id,
        payload={"content": content, "logged_via": "assistant"},
        occurred_at=utcnow(),
    )
    ctx.deps.session.add(event)
    await ctx.deps.session.flush()
    return f"已记录：{content}"


async def create_task_suggestion(
    ctx: RunContext[AssistantDeps],
    title: str,
    description: str = "",
    priority: int = 1,
    estimated_hours: float | None = None,
) -> str:
    """为当前用户创建一个任务建议。任务不会直接创建，而是进入建议列表等待确认。"""
    from src.models.ai_suggestion import AISuggestion
    from src.models.common import SuggestionStatus, SuggestionType

    target_ref = {
        "title": title,
        "description": description,
        "priority": priority,
    }
    if estimated_hours:
        target_ref["estimated_hours"] = estimated_hours

    suggestion = AISuggestion(
        tenant_id=ctx.deps.tenant_id,
        suggestion_type=SuggestionType.create_task,
        target_user_id=ctx.deps.user_id,
        target_ref=target_ref,
        rationale="由个人 AI 助手根据对话上下文创建",
        confidence=0.8,
        status=SuggestionStatus.pending,
    )
    ctx.deps.session.add(suggestion)
    await ctx.deps.session.flush()
    return f"已创建任务建议「{title}」，请在建议列表中确认。"
