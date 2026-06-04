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
    current_project_id: uuid.UUID | None = None  # 工作区当前项目 (附录 I.1)


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
    tasks = await repo.list_by_tenant(ctx.deps.tenant_id, status=task_status, limit=50)
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


async def decompose_into_project(ctx: RunContext[AssistantDeps], goal: str, project_id: str = "") -> str:
    """把一个新需求/目标拆解成子任务，归到指定项目（默认当前打开的项目）。走 ai_suggestions 等用户确认（附录 I.1）。"""
    from src.ai.decompose import decompose_goal
    from src.ai.usage import RecordCtx
    from src.models.ai_suggestion import AISuggestion
    from src.models.common import LLMTrigger, SuggestionStatus, SuggestionType
    from src.repositories.user_repo import UserRepository

    pid = project_id or (str(ctx.deps.current_project_id) if ctx.deps.current_project_id else "")
    if not pid:
        return "请先打开一个项目，或直接告诉我把这个需求拆进哪个项目。"

    members = await UserRepository(ctx.deps.session).list_by_tenant(ctx.deps.tenant_id)
    team = "\n".join(f"- {m.display_name}（{'PM' if m.is_pm else '成员'}，ID: {m.id}）" for m in members)
    team_context = "## 团队成员\n" + team if team else ""

    rec = RecordCtx(
        session=ctx.deps.session,
        tenant_id=ctx.deps.tenant_id,
        user_id=ctx.deps.user_id,
        trigger=LLMTrigger.dispatch,
    )
    plan = await decompose_goal(goal, team_context, record=rec)
    target_ref = {
        "title": plan.title,
        "description": plan.description,
        "priority": 1,
        "project_id": pid,  # accept 时加进这个已有项目 (附录 I.1)
        "subtasks": [
            {
                "title": st.title,
                "description": st.description,
                "priority": st.priority,
                "estimated_hours": st.estimated_hours,
                "suggested_owner_hint": st.suggested_owner_hint,
                "owner_user_id": None,
            }
            for st in plan.subtasks
        ],
    }
    suggestion = AISuggestion(
        tenant_id=ctx.deps.tenant_id,
        suggestion_type=SuggestionType.decompose,
        target_user_id=ctx.deps.user_id,
        target_ref=target_ref,
        rationale=plan.rationale,
        confidence=plan.confidence,
        based_on_events=[],
        status=SuggestionStatus.pending,
    )
    ctx.deps.session.add(suggestion)
    await ctx.deps.session.flush()
    return f"已把「{goal}」拆成 {len(plan.subtasks)} 个子任务的建议，去「AI 建议」确认后会落地到当前项目。"


async def get_task_impl_hint(ctx: RunContext[AssistantDeps], task_id: str) -> str:
    """查看某个任务当前的 AI 实现思路。"""
    from src.repositories.task_repo import TaskRepository

    task = await TaskRepository(ctx.deps.session).get_by_id(uuid.UUID(task_id))
    if not task or task.tenant_id != ctx.deps.tenant_id:
        return "找不到这个任务。"
    return task.impl_hint or "这个任务还没有实现思路。"


async def update_task_impl_hint(ctx: RunContext[AssistantDeps], task_id: str, hint: str) -> str:
    """与用户讨论后改写某个任务的 AI 实现思路。只能改自己负责的任务（附录 I.2）。"""
    from src.models.common import utcnow
    from src.repositories.task_repo import TaskRepository

    repo = TaskRepository(ctx.deps.session)
    task = await repo.get_by_id(uuid.UUID(task_id))
    if not task or task.tenant_id != ctx.deps.tenant_id:
        return "找不到这个任务。"
    if task.owner_user_id != ctx.deps.user_id:
        return "只能改你自己负责的任务的实现思路。"
    task.impl_hint = hint
    task.impl_hint_updated_at = utcnow()
    ctx.deps.session.add(task)
    await ctx.deps.session.flush()
    return f"已更新「{task.title}」的实现思路。"


async def remember(ctx: RunContext[AssistantDeps], note: str) -> str:
    """记住一条信息,持久化到助手记忆,跨会话保留(附录 J)。值得长期记住的事实/上下文才记。"""
    from src.repositories.assistant_repo import AssistantWorkspaceRepository

    repo = AssistantWorkspaceRepository(ctx.deps.session)
    ws = await repo.ensure(ctx.deps.tenant_id, ctx.deps.user_id)
    await repo.append_memory(ws, note)
    return f"已记住:{note}"


async def note_about_user(ctx: RunContext[AssistantDeps], note: str) -> str:
    """记录关于用户的一条画像信息(偏好/角色/工作方式等),持久化(附录 J)。"""
    from src.repositories.assistant_repo import AssistantWorkspaceRepository

    repo = AssistantWorkspaceRepository(ctx.deps.session)
    ws = await repo.ensure(ctx.deps.tenant_id, ctx.deps.user_id)
    await repo.append_profile(ws, note)
    return "已记录到用户画像。"


async def rewrite_memory(ctx: RunContext[AssistantDeps], markdown: str) -> str:
    """整篇重写助手记忆(用于压缩/整理过长的记忆),附录 J。"""
    from src.repositories.assistant_repo import AssistantWorkspaceRepository

    repo = AssistantWorkspaceRepository(ctx.deps.session)
    ws = await repo.ensure(ctx.deps.tenant_id, ctx.deps.user_id)
    await repo.patch(ws, memory_md=markdown)
    return "记忆已重写。"


async def save_skill(ctx: RunContext[AssistantDeps], name: str, description: str = "", instruction: str = "") -> str:
    """发现可复用的做法时,把它沉淀成一个技能(默认启用,跨会话保留),附录 J.5。"""
    from src.models.assistant_skill import AssistantSkill
    from src.repositories.assistant_repo import AssistantWorkspaceRepository
    from src.repositories.assistant_skill_repo import AssistantSkillRepository

    ws = await AssistantWorkspaceRepository(ctx.deps.session).ensure(ctx.deps.tenant_id, ctx.deps.user_id)
    skill = AssistantSkill(
        workspace_id=ws.id,
        tenant_id=ctx.deps.tenant_id,
        name=name,
        description=description,
        instruction_md=instruction,
        enabled=True,
    )
    await AssistantSkillRepository(ctx.deps.session).create(skill)
    return f"已沉淀技能「{name}」并启用。"


async def improve_skill(ctx: RunContext[AssistantDeps], name: str, instruction: str) -> str:
    """改进某个已有技能的指令(按技能名),附录 J.5。"""
    from src.repositories.assistant_repo import AssistantWorkspaceRepository
    from src.repositories.assistant_skill_repo import AssistantSkillRepository

    ws = await AssistantWorkspaceRepository(ctx.deps.session).ensure(ctx.deps.tenant_id, ctx.deps.user_id)
    repo = AssistantSkillRepository(ctx.deps.session)
    skill = await repo.get_by_name(ws.id, name)
    if not skill:
        return f"找不到技能「{name}」,可用 save_skill 新建。"
    await repo.update(skill, instruction_md=instruction)
    return f"已改进技能「{name}」。"


async def update_task_status(ctx: RunContext[AssistantDeps], task_id: str, new_status: str) -> str:
    """更新任务状态。new_status: todo/in_progress/blocked/review/done/archived。只能改自己的或未认领的任务。"""
    from src.models.common import TaskStatus
    from src.repositories.task_repo import TaskRepository

    try:
        status = TaskStatus(new_status)
    except ValueError:
        return f"无效状态「{new_status}」，可选：todo/in_progress/blocked/review/done/archived。"
    repo = TaskRepository(ctx.deps.session)
    task = await repo.get_by_id(uuid.UUID(task_id))
    if not task or task.tenant_id != ctx.deps.tenant_id:
        return "找不到这个任务。"
    if task.owner_user_id and task.owner_user_id != ctx.deps.user_id:
        return "只能更新你自己的或未认领的任务状态。"
    old = task.status.value
    await repo.update_status(task, status, ctx.deps.user_id)
    return f"已将「{task.title}」从 {old} 改为 {new_status}。"


async def list_my_projects(ctx: RunContext[AssistantDeps]) -> str:
    """列出当前用户参与的所有项目及完成度。"""
    from src.repositories.project_repo import ProjectRepository

    repo = ProjectRepository(ctx.deps.session)
    projects = await repo.list_for_member(ctx.deps.tenant_id, ctx.deps.user_id)
    if not projects:
        return "你当前没有参与任何项目。"
    lines = []
    for p in projects:
        counts = await repo.status_counts(p.id)
        total = sum(counts.values())
        done = counts.get("done", 0)
        pct = round(done / total * 100) if total else 0
        lines.append(f"- {p.name}（{total} 个任务，完成 {pct}%）")
    return f"你参与了 {len(projects)} 个项目：\n" + "\n".join(lines)


async def query_project_tasks(ctx: RunContext[AssistantDeps], status: str = "") -> str:
    """查询当前打开项目的任务列表。可选按状态筛选。"""
    from src.models.common import TaskStatus
    from src.repositories.task_repo import TaskRepository

    pid = ctx.deps.current_project_id
    if not pid:
        return "请先打开一个项目。"
    repo = TaskRepository(ctx.deps.session)
    task_status = TaskStatus(status) if status else None
    tasks = await repo.list_by_project(pid, status=task_status)
    if not tasks:
        return "当前项目没有任务。" + (f"（筛选：{status}）" if status else "")
    lines = []
    for t in tasks:
        owner = f" @{t.owner_user_id}" if t.owner_user_id else " 未认领"
        est = f" {t.estimated_hours}h" if t.estimated_hours else ""
        lines.append(f"- [{t.status.value}] {t.title}{owner}{est}（ID: {t.id}）")
    return f"当前项目共 {len(tasks)} 个任务：\n" + "\n".join(lines)


async def get_project_members(ctx: RunContext[AssistantDeps]) -> str:
    """查看当前打开项目的成员列表。"""
    from src.repositories.project_member_repo import ProjectMemberRepository
    from src.repositories.user_repo import UserRepository

    pid = ctx.deps.current_project_id
    if not pid:
        return "请先打开一个项目。"
    members = await ProjectMemberRepository(ctx.deps.session).list_by_project(pid)
    if not members:
        return "当前项目没有成员。"
    names = {u.id: u.display_name for u in await UserRepository(ctx.deps.session).list_by_tenant(ctx.deps.tenant_id)}
    lines = [f"- {names.get(m.user_id, '?')}（{m.role}）" for m in members]
    return f"项目成员 {len(members)} 人：\n" + "\n".join(lines)


async def web_search(ctx: RunContext[AssistantDeps], query: str) -> str:
    """搜索互联网，返回相关网页标题和摘要。用于调研客户、查行业资料、查技术方案等。"""
    from src.ai.web_search import search

    results = await search(query, max_results=5)
    if not results:
        return f"搜索「{query}」没有找到结果。"
    lines = []
    for r in results:
        lines.append(f"- **{r['title']}**\n  {r['url']}\n  {r['snippet']}")
    return f"搜索「{query}」找到 {len(results)} 条结果：\n\n" + "\n\n".join(lines)


async def fetch_url(ctx: RunContext[AssistantDeps], url: str) -> str:
    """读取指定网页的文本内容（用于深入了解搜索结果）。最多返回前 3000 字。"""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "TeamPlatform/1.0"})
        if resp.status_code != 200:
            return f"无法访问该页面（HTTP {resp.status_code}）。"
        import re

        text = re.sub(r"<script[^>]*>.*?</script>", "", resp.text, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 3000:
            text = text[:3000] + "...(已截断)"
        return text if text else "页面内容为空。"
    except Exception as e:
        return f"读取失败：{e}"


async def update_project_workspace(
    ctx: RunContext[AssistantDeps],
    field: str,
    content: str,
) -> str:
    """更新当前项目工作区的某个字段。field: background(背景) / context(上下文) / focus(当前重点)。
    仅 lead/PM/admin 可用。"""
    from src.repositories.project_member_repo import ProjectMemberRepository
    from src.repositories.project_workspace_repo import ProjectWorkspaceRepository
    from src.repositories.user_repo import UserRepository

    pid = ctx.deps.current_project_id
    if not pid:
        return "请先打开一个项目。"

    field_map = {
        "background": "background_md",
        "context": "context_md",
        "focus": "current_focus_md",
        "背景": "background_md",
        "上下文": "context_md",
        "当前重点": "current_focus_md",
    }
    db_field = field_map.get(field.lower())
    if not db_field:
        return f"无效字段「{field}」，可选：background / context / focus。"

    user = await UserRepository(ctx.deps.session).get_by_id(ctx.deps.user_id)
    if not (user and (user.is_pm or user.is_admin)):
        role = await ProjectMemberRepository(ctx.deps.session).role_of(pid, ctx.deps.user_id)
        if role != "lead":
            return "只有项目 lead、PM 或 admin 才能编辑项目工作区。"

    repo = ProjectWorkspaceRepository(ctx.deps.session)
    ws = await repo.ensure(ctx.deps.tenant_id, pid)
    await repo.patch(
        ws,
        **{db_field: content},
        updated_by=ctx.deps.user_id,
        expected_version=ws.version,
    )
    label = {"background_md": "背景", "context_md": "上下文", "current_focus_md": "当前重点"}[db_field]
    return f"已更新项目工作区的「{label}」。"


async def notify_teammate(ctx: RunContext[AssistantDeps], recipient_name: str, message: str) -> str:
    """向当前项目的某个成员发送一条消息通知。只能发给当前项目成员。
    用户说"告诉张三……"或"提醒李四……"时调用。消息会以通知形式送达对方。"""
    from src.models.audit_log import AuditLog
    from src.models.common import NotificationKind
    from src.models.notification import Notification
    from src.repositories.notification_repo import NotificationRepository
    from src.repositories.project_member_repo import ProjectMemberRepository
    from src.repositories.user_repo import UserRepository
    from src.services.sse_bus import notify

    pid = ctx.deps.current_project_id
    if not pid:
        return "请先打开一个项目才能发送消息给同事。"

    members = await ProjectMemberRepository(ctx.deps.session).list_by_project(pid)
    member_ids = [m.user_id for m in members]
    if ctx.deps.user_id not in member_ids:
        return "你不是当前项目的成员。"

    users = await UserRepository(ctx.deps.session).list_by_tenant(ctx.deps.tenant_id)
    name_map = {u.display_name.lower(): u for u in users}
    target = name_map.get(recipient_name.lower())
    if not target:
        for u in users:
            if recipient_name.lower() in u.display_name.lower():
                target = u
                break
    if not target or target.id not in member_ids:
        names = "、".join(u.display_name for u in users if u.id in member_ids and u.id != ctx.deps.user_id)
        return f"在当前项目中找不到「{recipient_name}」。项目成员：{names}"

    sender = next((u for u in users if u.id == ctx.deps.user_id), None)
    sender_name = sender.display_name if sender else "同事"

    if len(message) > 500:
        message = message[:500]

    n = Notification(
        tenant_id=ctx.deps.tenant_id,
        recipient_user_id=target.id,
        kind=NotificationKind.teammate_message,
        title=f"{sender_name} 通过助手发送：{message[:60]}",
        body=message,
        source_ref={
            "sender_user_id": str(ctx.deps.user_id),
            "project_id": str(pid),
        },
    )
    await NotificationRepository(ctx.deps.session).create(n)
    ctx.deps.session.add(
        AuditLog(
            tenant_id=ctx.deps.tenant_id,
            actor_id=ctx.deps.user_id,
            action="teammate_message.send",
            target_type="notification",
            target_id=n.id,
            detail={
                "recipient": str(target.id),
                "project_id": str(pid),
            },
        )
    )
    await ctx.deps.session.flush()
    notify(target.id, {"type": "notification", "kind": "teammate_message", "title": n.title})
    return f"已发送给 {target.display_name}：{message}"
