"""Project routes — list, create, detail, board, share."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from src.ai.brief import ProgressBrief, generate_brief
from src.ai.usage import RecordCtx
from src.api.deps import CurrentUser, DBSession
from src.core.config import get_settings
from src.models.common import LLMTrigger, ReportKind, TaskStatus, utcnow
from src.models.event_cache import EventCache
from src.models.project import Project
from src.models.report import Report
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
    status: str | None = None  # active | archived


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


# ─── routes ───
@router.get("", response_model=list[ProjectResponse])
async def list_projects(current_user: CurrentUser, session: DBSession):
    prepo = ProjectRepository(session)
    out = []
    for p in await prepo.list_by_tenant(current_user.tenant_id):
        out.append(_summary(p, await prepo.status_counts(p.id)))
    return out


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(req: ProjectCreate, current_user: CurrentUser, session: DBSession):
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
    return _summary(p, {})


async def _get_owned(project_id: uuid.UUID, current_user, session) -> Project:
    p = await ProjectRepository(session).get_by_id(project_id)
    if not p or p.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    p = await _get_owned(project_id, current_user, session)
    counts = await ProjectRepository(session).status_counts(p.id)
    return _summary(p, counts)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: uuid.UUID, req: ProjectUpdate, current_user: CurrentUser, session: DBSession):
    p = await _get_owned(project_id, current_user, session)
    if req.name is not None:
        p.name = req.name
    if req.description is not None:
        p.description = req.description
    if req.status is not None:
        if req.status not in ("active", "archived"):
            raise HTTPException(status_code=422, detail="status must be active|archived")
        p.status = req.status
    prepo = ProjectRepository(session)
    await prepo.update(p)
    return _summary(p, await prepo.status_counts(p.id))


@router.get("/{project_id}/tasks", response_model=list[TaskResponse])
async def project_tasks(project_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    await _get_owned(project_id, current_user, session)
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
async def project_share(project_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    """Read-only progress/flow view — visible to any team member."""
    p = await _get_owned(project_id, current_user, session)
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
    if events:
        lines.append("\n成员投送的工作痕迹(近期):")
        for e in events:
            who = names.get(e.actor_user_id, "某成员")
            content = (e.payload or {}).get("content", "")
            lines.append(f"    - {who}:{content}")
    else:
        lines.append("\n(暂无成员投送的工作痕迹)")
    return "\n".join(lines)


@router.post("/{project_id}/brief", response_model=ProgressBrief)
async def project_brief(project_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    """Generate an AI progress brief for the share page (on-demand)."""
    p = await _get_owned(project_id, current_user, session)
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
