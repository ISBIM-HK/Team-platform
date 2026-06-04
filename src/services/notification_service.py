"""NotificationService — business-level notification triggers.

Computes recipients and creates notification records within the same DB transaction.
Routes/services call these after completing the business operation.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import NotificationKind
from src.models.notification import Notification
from src.repositories.notification_repo import NotificationRepository
from src.repositories.project_member_repo import ProjectMemberRepository
from src.services.sse_bus import notify_many

_NOTIF_TITLES: dict[str, dict[str, str]] = {
    "task_status": {
        "zh-CN": "任务「{name}」状态变更：{old} → {new}",
        "zh-HK": "任務「{name}」狀態變更：{old} → {new}",
        "en": 'Task "{name}" status changed: {old} → {new}',
    },
    "workspace_edited": {
        "zh-CN": "项目「{name}」工作区已更新",
        "zh-HK": "項目「{name}」工作區已更新",
        "en": 'Project "{name}" workspace updated',
    },
    "task_created": {
        "zh-CN": "新任务「{name}」已创建",
        "zh-HK": "新任務「{name}」已創建",
        "en": 'New task "{name}" created',
    },
    "brief_generated": {
        "zh-CN": "项目「{name}」进展简报已生成",
        "zh-HK": "項目「{name}」進展簡報已生成",
        "en": 'Project "{name}" progress brief generated',
    },
    "member_added": {
        "zh-CN": "你已被加入项目「{name}」",
        "zh-HK": "你已被加入項目「{name}」",
        "en": 'You have been added to project "{name}"',
    },
    "task_claimed": {
        "zh-CN": "任务「{name}」已被认领",
        "zh-HK": "任務「{name}」已被認領",
        "en": 'Task "{name}" has been claimed',
    },
}

_NOTIF_BODIES: dict[str, dict[str, str]] = {
    "task_status": {
        "zh-CN": "任务「{name}」的状态从 {old} 变更为 {new}。",
        "zh-HK": "任務「{name}」的狀態從 {old} 變更為 {new}。",
        "en": 'The status of task "{name}" changed from {old} to {new}.',
    },
    "workspace_edited": {
        "zh-CN": "项目「{name}」的工作区（背景/上下文/当前重点）已被更新。",
        "zh-HK": "項目「{name}」的工作區（背景/上下文/當前重點）已被更新。",
        "en": 'The workspace (background/context/focus) of project "{name}" has been updated.',
    },
    "task_created": {
        "zh-CN": "项目中新增了任务「{name}」。",
        "zh-HK": "項目中新增了任務「{name}」。",
        "en": 'A new task "{name}" has been created in the project.',
    },
    "brief_generated": {
        "zh-CN": "项目「{name}」的 AI 进展简报已生成，前往进度分享页查看。",
        "zh-HK": "項目「{name}」的 AI 進展簡報已生成，前往進度分享頁查看。",
        "en": 'An AI progress brief for project "{name}" has been generated. Check the Progress tab.',
    },
    "member_added": {
        "zh-CN": "你已被加入项目「{name}」，可以在左侧项目列表中找到它。",
        "zh-HK": "你已被加入項目「{name}」，可以在左側項目列表中找到它。",
        "en": 'You have been added to project "{name}". Find it in the project list.',
    },
    "task_claimed": {
        "zh-CN": "有人认领了任务「{name}」。",
        "zh-HK": "有人認領了任務「{name}」。",
        "en": 'Someone claimed task "{name}".',
    },
}


def _i18n_titles(template_key: str, **kwargs: str) -> dict[str, str]:
    tpl = _NOTIF_TITLES.get(template_key, {})
    return {lang: t.format(**kwargs) for lang, t in tpl.items()}


def _i18n_bodies(template_key: str, **kwargs: str) -> dict[str, str]:
    tpl = _NOTIF_BODIES.get(template_key, {})
    return {lang: t.format(**kwargs) for lang, t in tpl.items()}


class NotificationService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = NotificationRepository(session)
        self._pending_sse: list[tuple[list[uuid.UUID], dict]] = []

    async def _notify(
        self,
        recipients: list[uuid.UUID],
        kind: NotificationKind,
        title: str,
        body: str = "",
        source_ref: dict | None = None,
        titles: dict[str, str] | None = None,
        bodies: dict[str, str] | None = None,
    ) -> list[Notification]:
        ref = dict(source_ref or {})
        if titles:
            ref["titles"] = titles
        if bodies:
            ref["bodies"] = bodies
        created = []
        for uid in recipients:
            n = Notification(
                tenant_id=self.tenant_id,
                recipient_user_id=uid,
                kind=kind,
                title=title,
                body=body,
                source_ref=ref,
            )
            await self.repo.create(n)
            created.append(n)
        if recipients:
            self._pending_sse.append((list(recipients), {"type": "notification", "kind": kind.value, "title": title}))
        return created

    def flush_sse(self):
        """Push SSE signals. Call AFTER session.commit() to avoid ghost notifications."""
        for user_ids, data in self._pending_sse:
            notify_many(user_ids, data)
        self._pending_sse.clear()

    async def _project_member_ids(self, project_id: uuid.UUID, exclude: uuid.UUID | None = None) -> list[uuid.UUID]:
        members = await ProjectMemberRepository(self.session).list_by_project(project_id)
        return [m.user_id for m in members if m.user_id != exclude]

    async def _project_lead_ids(self, project_id: uuid.UUID, exclude: uuid.UUID | None = None) -> list[uuid.UUID]:
        members = await ProjectMemberRepository(self.session).list_by_project(project_id)
        return [m.user_id for m in members if m.role == "lead" and m.user_id != exclude]

    async def task_status_changed(
        self,
        task_id: uuid.UUID,
        task_title: str,
        old_status: str,
        new_status: str,
        owner_id: uuid.UUID | None,
        actor_id: uuid.UUID,
    ):
        if not owner_id or owner_id == actor_id:
            return
        kw = dict(name=task_title, old=old_status, new=new_status)
        await self._notify(
            [owner_id],
            NotificationKind.system,
            _i18n_titles("task_status", **kw).get("zh-CN", ""),
            source_ref={"task_id": str(task_id)},
            titles=_i18n_titles("task_status", **kw),
            bodies=_i18n_bodies("task_status", **kw),
        )

    async def project_workspace_edited(self, project_id: uuid.UUID, project_name: str, actor_id: uuid.UUID):
        recipients = await self._project_member_ids(project_id, exclude=actor_id)
        if not recipients:
            return
        kw = dict(name=project_name)
        await self._notify(
            recipients,
            NotificationKind.system,
            _i18n_titles("workspace_edited", **kw).get("zh-CN", ""),
            source_ref={"project_id": str(project_id)},
            titles=_i18n_titles("workspace_edited", **kw),
            bodies=_i18n_bodies("workspace_edited", **kw),
        )

    async def task_created(self, project_id: uuid.UUID, task_title: str, actor_id: uuid.UUID):
        leads = await self._project_lead_ids(project_id, exclude=actor_id)
        if not leads:
            return
        kw = dict(name=task_title)
        await self._notify(
            leads,
            NotificationKind.system,
            _i18n_titles("task_created", **kw).get("zh-CN", ""),
            source_ref={"project_id": str(project_id)},
            titles=_i18n_titles("task_created", **kw),
            bodies=_i18n_bodies("task_created", **kw),
        )

    async def brief_generated(self, project_id: uuid.UUID, project_name: str, actor_id: uuid.UUID):
        recipients = await self._project_member_ids(project_id, exclude=actor_id)
        if not recipients:
            return
        kw = dict(name=project_name)
        await self._notify(
            recipients,
            NotificationKind.report_ready,
            _i18n_titles("brief_generated", **kw).get("zh-CN", ""),
            source_ref={"project_id": str(project_id)},
            titles=_i18n_titles("brief_generated", **kw),
            bodies=_i18n_bodies("brief_generated", **kw),
        )

    async def member_added(self, project_id: uuid.UUID, project_name: str, user_id: uuid.UUID):
        kw = dict(name=project_name)
        await self._notify(
            [user_id],
            NotificationKind.system,
            _i18n_titles("member_added", **kw).get("zh-CN", ""),
            source_ref={"project_id": str(project_id)},
            titles=_i18n_titles("member_added", **kw),
            bodies=_i18n_bodies("member_added", **kw),
        )

    async def task_claimed(self, project_id: uuid.UUID, task_title: str, claimer_id: uuid.UUID):
        leads = await self._project_lead_ids(project_id, exclude=claimer_id)
        if not leads:
            return
        kw = dict(name=task_title)
        await self._notify(
            leads,
            NotificationKind.task_claimed,
            _i18n_titles("task_claimed", **kw).get("zh-CN", ""),
            source_ref={"project_id": str(project_id)},
            titles=_i18n_titles("task_claimed", **kw),
            bodies=_i18n_bodies("task_claimed", **kw),
        )
