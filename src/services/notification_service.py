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

_NOTIF_TEMPLATES: dict[str, dict[str, str]] = {
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


def _i18n_titles(template_key: str, **kwargs: str) -> dict[str, str]:
    tpl = _NOTIF_TEMPLATES.get(template_key, {})
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
    ) -> list[Notification]:
        ref = dict(source_ref or {})
        if titles:
            ref["titles"] = titles
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
        titles = _i18n_titles("task_status", name=task_title, old=old_status, new=new_status)
        await self._notify(
            [owner_id],
            NotificationKind.system,
            titles.get("zh-CN", f"任务「{task_title}」状态变更"),
            source_ref={"task_id": str(task_id)},
            titles=titles,
        )

    async def project_workspace_edited(self, project_id: uuid.UUID, project_name: str, actor_id: uuid.UUID):
        recipients = await self._project_member_ids(project_id, exclude=actor_id)
        if not recipients:
            return
        titles = _i18n_titles("workspace_edited", name=project_name)
        await self._notify(
            recipients,
            NotificationKind.system,
            titles.get("zh-CN", f"项目「{project_name}」工作区已更新"),
            source_ref={"project_id": str(project_id)},
            titles=titles,
        )

    async def task_created(self, project_id: uuid.UUID, task_title: str, actor_id: uuid.UUID):
        leads = await self._project_lead_ids(project_id, exclude=actor_id)
        if not leads:
            return
        titles = _i18n_titles("task_created", name=task_title)
        await self._notify(
            leads,
            NotificationKind.system,
            titles.get("zh-CN", f"新任务「{task_title}」已创建"),
            source_ref={"project_id": str(project_id)},
            titles=titles,
        )

    async def brief_generated(self, project_id: uuid.UUID, project_name: str, actor_id: uuid.UUID):
        recipients = await self._project_member_ids(project_id, exclude=actor_id)
        if not recipients:
            return
        titles = _i18n_titles("brief_generated", name=project_name)
        await self._notify(
            recipients,
            NotificationKind.report_ready,
            titles.get("zh-CN", f"项目「{project_name}」进展简报已生成"),
            source_ref={"project_id": str(project_id)},
            titles=titles,
        )

    async def member_added(self, project_id: uuid.UUID, project_name: str, user_id: uuid.UUID):
        titles = _i18n_titles("member_added", name=project_name)
        await self._notify(
            [user_id],
            NotificationKind.system,
            titles.get("zh-CN", f"你已被加入项目「{project_name}」"),
            source_ref={"project_id": str(project_id)},
            titles=titles,
        )

    async def task_claimed(self, project_id: uuid.UUID, task_title: str, claimer_id: uuid.UUID):
        leads = await self._project_lead_ids(project_id, exclude=claimer_id)
        if not leads:
            return
        titles = _i18n_titles("task_claimed", name=task_title)
        await self._notify(
            leads,
            NotificationKind.task_claimed,
            titles.get("zh-CN", f"任务「{task_title}」已被认领"),
            source_ref={"project_id": str(project_id)},
            titles=titles,
        )
