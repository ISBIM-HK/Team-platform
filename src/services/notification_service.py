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
    ) -> list[Notification]:
        created = []
        for uid in recipients:
            n = Notification(
                tenant_id=self.tenant_id,
                recipient_user_id=uid,
                kind=kind,
                title=title,
                body=body,
                source_ref=source_ref,
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
        await self._notify(
            [owner_id],
            NotificationKind.system,
            f"任务「{task_title}」状态变更：{old_status} → {new_status}",
            source_ref={"task_id": str(task_id)},
        )

    async def project_workspace_edited(self, project_id: uuid.UUID, project_name: str, actor_id: uuid.UUID):
        recipients = await self._project_member_ids(project_id, exclude=actor_id)
        if not recipients:
            return
        await self._notify(
            recipients,
            NotificationKind.system,
            f"项目「{project_name}」工作区已更新",
            source_ref={"project_id": str(project_id)},
        )

    async def task_created(self, project_id: uuid.UUID, task_title: str, actor_id: uuid.UUID):
        leads = await self._project_lead_ids(project_id, exclude=actor_id)
        if not leads:
            return
        await self._notify(
            leads,
            NotificationKind.system,
            f"新任务「{task_title}」已创建",
            source_ref={"project_id": str(project_id)},
        )

    async def brief_generated(self, project_id: uuid.UUID, project_name: str, actor_id: uuid.UUID):
        recipients = await self._project_member_ids(project_id, exclude=actor_id)
        if not recipients:
            return
        await self._notify(
            recipients,
            NotificationKind.report_ready,
            f"项目「{project_name}」进展简报已生成",
            source_ref={"project_id": str(project_id)},
        )

    async def member_added(self, project_id: uuid.UUID, project_name: str, user_id: uuid.UUID):
        await self._notify(
            [user_id],
            NotificationKind.system,
            f"你已被加入项目「{project_name}」",
            source_ref={"project_id": str(project_id)},
        )

    async def task_claimed(self, project_id: uuid.UUID, task_title: str, claimer_id: uuid.UUID):
        leads = await self._project_lead_ids(project_id, exclude=claimer_id)
        if not leads:
            return
        await self._notify(
            leads,
            NotificationKind.task_claimed,
            f"任务「{task_title}」已被认领",
            source_ref={"project_id": str(project_id)},
        )
