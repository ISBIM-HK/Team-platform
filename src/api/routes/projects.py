"""Project routes — list, create, detail, board, share."""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession
from src.models.common import TaskStatus
from src.models.project import Project
from src.repositories.project_repo import ProjectRepository
from src.repositories.task_repo import TaskRepository
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
        id=str(project.id), name=project.name, description=project.description,
        status=project.status, task_count=total, done_count=done,
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
    p = await prepo.create(Project(
        tenant_id=current_user.tenant_id, name=req.name,
        description=req.description, status="active", created_by=current_user.id,
    ))
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


@router.get("/{project_id}/share", response_model=ShareResponse)
async def project_share(project_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    """Read-only progress/flow view — visible to any team member."""
    p = await _get_owned(project_id, current_user, session)
    prepo = ProjectRepository(session)
    counts = await prepo.status_counts(p.id)
    tasks = await TaskRepository(session).list_by_project(project_id)
    return ShareResponse(
        project=_summary(p, counts),
        status_counts=counts,
        tasks=[TaskResponse.model_validate(t) for t in tasks],
    )
