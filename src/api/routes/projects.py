"""Project routes — list, create, detail, board, share."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from src.ai.brief import ProgressBrief, generate_brief
from src.ai.usage import RecordCtx
from src.api.deps import CurrentUser, DBSession, require_any_scope, require_scope
from src.core.config import get_settings
from src.models.audit_log import AuditLog
from src.models.common import LLMTrigger, ReportKind, TaskStatus, utcnow
from src.models.event_cache import EventCache
from src.models.project import INBOX_NAME, Project
from src.models.report import Report
from src.repositories.project_member_repo import ProjectMemberRepository
from src.repositories.project_repo import ProjectRepository
from src.repositories.task_repo import TaskRepository
from src.repositories.user_repo import UserRepository
from src.schemas.task import TaskResponse

router = APIRouter(prefix="/projects", tags=["projects"])

DONE_STATUSES = {TaskStatus.done.value, TaskStatus.archived.value}


# ─── schemas ───
class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None  # active | archived; deleted uses DELETE


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    status: str
    task_count: int
    done_count: int
    completion: float  # 0..1

    model_config = {"from_attributes": True}


def _summary(project: Project, counts: dict[str, int]) -> ProjectResponse:
    total = sum(counts.values())
    done = sum(counts.get(s, 0) for s in DONE_STATUSES)
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        status=project.status,
        task_count=total,
        done_count=done,
        completion=round(done / total, 3) if total else 0.0,
    )


# ─── access control (项目级 ACL, 附录 K) ───
def _privileged(current_user) -> bool:
    """Global is_pm / is_admin act as a tenant super-permission above project ACL."""
    return bool(current_user.is_pm or current_user.is_admin)


async def _get_accessible(project_id: uuid.UUID, current_user, session, *, need_lead: bool = False) -> Project:
    """Resolve a project the caller may access, or 404 (don't leak existence).

    Membership grants read/member access; need_lead requires lead role.
    Global is_pm/is_admin bypass both.
    """
    p = await ProjectRepository(session).get_by_id(project_id)
    if not p or p.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Project not found")
    if _privileged(current_user):
        return p
    role = await ProjectMemberRepository(session).role_of(p.id, current_user.id)
    if role is None:
        raise HTTPException(status_code=404, detail="Project not found")  # 404 over 403
    if need_lead and role != "lead":
        raise HTTPException(status_code=403, detail="Lead only")
    return p


# ─── routes ───
@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("projects:read", "projects:write")),
    include_archived: bool = False,
):
    prepo = ProjectRepository(session)
    if _privileged(current_user):
        projects = await prepo.list_by_tenant(
            current_user.tenant_id, include_archived=include_archived, viewer_id=current_user.id
        )
    else:
        projects = await prepo.list_for_member(
            current_user.tenant_id, current_user.id, include_archived=include_archived
        )
    out = []
    for p in projects:
        counts = await prepo.status_counts(p.id)
        if p.name == INBOX_NAME and sum(counts.values()) == 0:
            continue
        out.append(_summary(p, counts))
    return out


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    req: ProjectCreate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    prepo = ProjectRepository(session)
    p = await prepo.create(
        Project(
            tenant_id=current_user.tenant_id,
            name=req.name,
            description=req.description,
            status="active",
            created_by=current_user.id,
        )
    )
    # Creator becomes lead + member (附录 K §2)
    await ProjectMemberRepository(session).add(current_user.tenant_id, p.id, current_user.id, role="lead")
    return _summary(p, {})


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("projects:read", "projects:write")),
):
    p = await _get_accessible(project_id, current_user, session)
    counts = await ProjectRepository(session).status_counts(p.id)
    return _summary(p, counts)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    req: ProjectUpdate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    p = await _get_accessible(project_id, current_user, session, need_lead=True)
    was_inbox = p.name == INBOX_NAME
    old_status = p.status
    if req.status is not None:
        if req.status == "deleted":
            raise HTTPException(status_code=422, detail="删除请用 DELETE")
        if req.status not in ("active", "archived"):
            raise HTTPException(status_code=422, detail="status must be active|archived")
        if was_inbox and req.status == "archived":
            raise HTTPException(status_code=400, detail="Inbox project cannot be archived")
    if req.name is not None:
        p.name = req.name
    if req.description is not None:
        p.description = req.description
    if req.status is not None:
        p.status = req.status
        if old_status != p.status:
            action = "project.archive" if p.status == "archived" else "project.restore"
            session.add(
                AuditLog(
                    tenant_id=current_user.tenant_id,
                    action=action,
                    actor_id=current_user.id,
                    target_type="project",
                    target_id=p.id,
                    detail={"name": p.name},
                )
            )
    prepo = ProjectRepository(session)
    await prepo.update(p)
    return _summary(p, await prepo.status_counts(p.id))


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    """Soft-delete a project by hiding it from all project lists."""
    p = await _get_accessible(project_id, current_user, session, need_lead=True)
    if p.name == INBOX_NAME:
        raise HTTPException(status_code=400, detail="Inbox project cannot be deleted")
    old_status = p.status
    p.status = "deleted"
    if old_status != p.status:
        session.add(
            AuditLog(
                tenant_id=current_user.tenant_id,
                action="project.delete",
                actor_id=current_user.id,
                target_type="project",
                target_id=p.id,
                detail={"name": p.name},
            )
        )
    await ProjectRepository(session).update(p)


@router.get("/{project_id}/tasks", response_model=list[TaskResponse])
async def project_tasks(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("projects:read", "projects:write")),
):
    await _get_accessible(project_id, current_user, session)
    tasks = await TaskRepository(session).list_by_project(project_id)
    return [TaskResponse.model_validate(t) for t in tasks]


class ShareResponse(BaseModel):
    project: ProjectResponse
    status_counts: dict[str, int]
    tasks: list[TaskResponse]  # for the flow/progress view (incl parent/child via parent_task_id)
    brief: ProgressBrief | None = None  # latest persisted AI brief (附录 H.4), null if never generated
    brief_generated_at: datetime | None = None


async def _latest_brief(session, project_id: uuid.UUID) -> tuple[ProgressBrief | None, datetime | None]:
    """Most recent persisted project_brief report for this project (share reads, never regenerates)."""
    row = (
        (
            await session.execute(
                select(Report)
                .where(Report.project_id == project_id, Report.kind == ReportKind.project_brief)
                .order_by(Report.generated_at.desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    if not row:
        return None, None
    return ProgressBrief.model_validate(row.content), row.generated_at


@router.get("/{project_id}/share", response_model=ShareResponse)
async def project_share(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("projects:read", "projects:write")),
):
    """Read-only progress/flow view — visible to any team member."""
    p = await _get_accessible(project_id, current_user, session)
    prepo = ProjectRepository(session)
    counts = await prepo.status_counts(p.id)
    tasks = await TaskRepository(session).list_by_project(project_id)
    brief, brief_at = await _latest_brief(session, p.id)
    return ShareResponse(
        project=_summary(p, counts),
        status_counts=counts,
        tasks=[TaskResponse.model_validate(t) for t in tasks],
        brief=brief,
        brief_generated_at=brief_at,
    )


_STATUS_CN = {
    TaskStatus.todo.value: "待办",
    TaskStatus.in_progress.value: "进行中",
    TaskStatus.blocked.value: "阻塞",
    TaskStatus.review.value: "评审中",
    TaskStatus.done.value: "已完成",
    TaskStatus.archived.value: "已归档",
}


async def _build_brief_context(project, tasks, events, names: dict) -> str:
    lines = [f"项目:{project.name}"]
    if project.description:
        lines.append(f"项目说明:{project.description}")
    lines.append("\n任务清单(按状态):")
    by_status: dict[str, list] = {}
    for t in tasks:
        by_status.setdefault(t.status.value if hasattr(t.status, "value") else t.status, []).append(t)
    for status, items in by_status.items():
        lines.append(f"  [{_STATUS_CN.get(status, status)}] {len(items)} 项")
        for t in items:
            owner = names.get(t.owner_user_id, "未分配")
            lines.append(f"    - {t.title}(负责人:{owner})")
    visible = [e for e in events if (e.payload or {}).get("visibility", "project") != "self"]
    if visible:
        lines.append("\n成员投送的工作痕迹(近期):")
        for e in visible:
            who = names.get(e.actor_user_id, "某成员")
            p = e.payload or {}
            content = p.get("content", "")
            repo, sha, branch = p.get("repo"), p.get("sha"), p.get("branch")
            if repo and sha:
                ref = f"{repo}/{branch}" if branch else repo
                stats = ""
                if p.get("files_changed") is not None:
                    stats = f" ({p['files_changed']} files, +{p.get('insertions', 0)}/-{p.get('deletions', 0)})"
                content = f"[commit {sha[:7]}] {ref}: {content}{stats}"
            agent = p.get("source_agent")
            via = f" (via {agent})" if agent else ""
            lines.append(f"    - {who}:{content}{via}")
    else:
        lines.append("\n(暂无成员投送的工作痕迹)")
    return "\n".join(lines)


@router.post("/{project_id}/brief", response_model=ProgressBrief)
async def project_brief(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("brief")),
):
    """Generate an AI progress brief for the share page (on-demand)."""
    p = await _get_accessible(project_id, current_user, session)
    tasks = await TaskRepository(session).list_by_project(project_id)
    events = (
        (
            await session.execute(
                select(EventCache)
                .where(EventCache.project_id == project_id)
                .order_by(EventCache.occurred_at.desc())
                .limit(40)
            )
        )
        .scalars()
        .all()
    )
    names = {u.id: u.display_name for u in await UserRepository(session).list_by_tenant(current_user.tenant_id)}
    context = await _build_brief_context(p, tasks, events, names)
    record = RecordCtx(
        session=session,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        trigger=LLMTrigger.weekly_report,
        triggered_by_id=p.id,
    )
    brief = await generate_brief(context, record=record)
    # Persist as a project_brief report (append; share reads the latest). 附录 H.4
    session.add(
        Report(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            project_id=p.id,
            kind=ReportKind.project_brief,
            report_date=utcnow().date(),
            content=brief.model_dump(),
            model_used=get_settings().llm_model_strong,
        )
    )
    await session.commit()
    return brief


# ─── project members (附录 K §4) ───
class MemberAdd(BaseModel):
    user_id: uuid.UUID
    role: str = "member"  # 'lead' | 'member'


class MemberRoleUpdate(BaseModel):
    role: str


class MemberResponse(BaseModel):
    user_id: str
    name: str
    role: str
    added_at: datetime


def _validate_role(role: str) -> None:
    if role not in ("lead", "member"):
        raise HTTPException(status_code=422, detail="role must be lead|member")


async def _members_payload(project_id: uuid.UUID, current_user, session) -> list[MemberResponse]:
    mrepo = ProjectMemberRepository(session)
    members = await mrepo.list_by_project(project_id)
    names = {u.id: u.display_name for u in await UserRepository(session).list_by_tenant(current_user.tenant_id)}
    return [
        MemberResponse(user_id=str(m.user_id), name=names.get(m.user_id, "?"), role=m.role, added_at=m.added_at)
        for m in members
    ]


@router.get("/{project_id}/members", response_model=list[MemberResponse])
async def list_members(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    """Any member (or privileged) may read the roster."""
    await _get_accessible(project_id, current_user, session)
    return await _members_payload(project_id, current_user, session)


@router.post("/{project_id}/members", response_model=list[MemberResponse], status_code=201)
async def add_member(
    project_id: uuid.UUID,
    req: MemberAdd,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    """lead (or privileged) adds a member. Target must be in the same tenant."""
    await _get_accessible(project_id, current_user, session, need_lead=True)
    _validate_role(req.role)
    target = await UserRepository(session).get_by_id(req.user_id)
    if not target or target.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")
    await ProjectMemberRepository(session).add(current_user.tenant_id, project_id, req.user_id, role=req.role)
    return await _members_payload(project_id, current_user, session)


@router.patch("/{project_id}/members/{user_id}", response_model=list[MemberResponse])
async def update_member_role(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    req: MemberRoleUpdate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    await _get_accessible(project_id, current_user, session, need_lead=True)
    _validate_role(req.role)
    mrepo = ProjectMemberRepository(session)
    m = await mrepo.get(project_id, user_id)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    # Demoting the last lead would orphan the project
    if m.role == "lead" and req.role != "lead" and await mrepo.count_leads(project_id) <= 1:
        raise HTTPException(status_code=422, detail="Cannot demote the last lead")
    await mrepo.add(current_user.tenant_id, project_id, user_id, role=req.role)
    return await _members_payload(project_id, current_user, session)


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    await _get_accessible(project_id, current_user, session, need_lead=True)
    mrepo = ProjectMemberRepository(session)
    m = await mrepo.get(project_id, user_id)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    if m.role == "lead" and await mrepo.count_leads(project_id) <= 1:
        raise HTTPException(status_code=422, detail="Cannot remove the last lead")
    await mrepo.remove(project_id, user_id)
