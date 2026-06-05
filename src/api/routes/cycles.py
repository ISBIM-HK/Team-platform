"""Cycle routes — time-boxed iterations (sprints) for projects."""

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession, require_any_scope, require_scope
from src.models.common import TaskStatus, utcnow
from src.models.cycle import Cycle, CycleTask
from src.models.task import Task
from src.repositories.cycle_repo import CycleRepository
from src.repositories.project_member_repo import ProjectMemberRepository
from src.repositories.project_repo import ProjectRepository
from src.schemas.task import TaskResponse

router = APIRouter(prefix="/projects/{project_id}/cycles", tags=["cycles"])


# ─── schemas ───


class CycleCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "planned"  # planned | active
    start_date: date
    end_date: date


class CycleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None  # planned | active | completed | archived
    start_date: date | None = None
    end_date: date | None = None


class CycleStatsResponse(BaseModel):
    total: int
    completed: int
    in_progress: int
    blocked: int
    todo: int
    completion_pct: float


class CycleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    status: str
    start_date: date
    end_date: date
    created_by: uuid.UUID
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CycleDetailResponse(CycleResponse):
    stats: CycleStatsResponse


class CycleTaskAdd(BaseModel):
    task_id: uuid.UUID


class CycleCloseResponse(BaseModel):
    cycle: CycleResponse
    incomplete_tasks: list[TaskResponse]


VALID_STATUSES = {"planned", "active", "completed", "archived"}
CREATE_STATUSES = {"planned", "active"}


# ─── access control helpers ───


def _privileged(current_user) -> bool:
    return bool(current_user.is_pm or current_user.is_admin)


async def _get_project_accessible(project_id: uuid.UUID, current_user, session, *, need_lead: bool = False):
    """Resolve a project the caller may access, or 404."""
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


async def _get_cycle(project_id: uuid.UUID, cycle_id: uuid.UUID, session, *, tenant_id: uuid.UUID) -> Cycle:
    """Fetch cycle and verify it belongs to the project + tenant."""
    repo = CycleRepository(session)
    cycle = await repo.get_by_id(cycle_id)
    if not cycle or cycle.project_id != project_id or cycle.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return cycle


# ─── routes ───


@router.get("", response_model=list[CycleResponse])
async def list_cycles(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("projects:read", "projects:write")),
):
    await _get_project_accessible(project_id, current_user, session)
    cycles = await CycleRepository(session).list_by_project(current_user.tenant_id, project_id)
    return [CycleResponse.model_validate(c) for c in cycles]


@router.post("", response_model=CycleResponse, status_code=201)
async def create_cycle(
    project_id: uuid.UUID,
    req: CycleCreate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    await _get_project_accessible(project_id, current_user, session, need_lead=True)

    if req.status not in CREATE_STATUSES:
        raise HTTPException(status_code=422, detail="status must be planned|active")

    if req.end_date <= req.start_date:
        raise HTTPException(status_code=422, detail="end_date must be after start_date")

    # Enforce: at most one active cycle per project
    if req.status == "active":
        repo = CycleRepository(session)
        existing = await repo.get_active_cycle(current_user.tenant_id, project_id)
        if existing:
            raise HTTPException(status_code=409, detail="Project already has an active cycle")

    cycle = Cycle(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        name=req.name,
        description=req.description,
        status=req.status,
        start_date=req.start_date,
        end_date=req.end_date,
        created_by=current_user.id,
    )
    cycle = await CycleRepository(session).create(cycle)
    await session.commit()
    return CycleResponse.model_validate(cycle)


@router.get("/{cycle_id}", response_model=CycleDetailResponse)
async def get_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("projects:read", "projects:write")),
):
    await _get_project_accessible(project_id, current_user, session)
    cycle = await _get_cycle(project_id, cycle_id, session, tenant_id=current_user.tenant_id)
    stats = await CycleRepository(session).get_cycle_stats(cycle_id)
    return CycleDetailResponse(
        **CycleResponse.model_validate(cycle).model_dump(),
        stats=CycleStatsResponse(**stats),
    )


@router.patch("/{cycle_id}", response_model=CycleResponse)
async def update_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    req: CycleUpdate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    await _get_project_accessible(project_id, current_user, session, need_lead=True)
    cycle = await _get_cycle(project_id, cycle_id, session, tenant_id=current_user.tenant_id)

    if req.status is not None:
        if req.status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail="status must be planned|active|completed|archived")
        # If transitioning to active, check no other active cycle
        if req.status == "active" and cycle.status != "active":
            existing = await CycleRepository(session).get_active_cycle(current_user.tenant_id, project_id)
            if existing and existing.id != cycle.id:
                raise HTTPException(status_code=409, detail="Project already has an active cycle")
        cycle.status = req.status

    if req.name is not None:
        cycle.name = req.name
    if req.description is not None:
        cycle.description = req.description
    if req.start_date is not None:
        cycle.start_date = req.start_date
    if req.end_date is not None:
        cycle.end_date = req.end_date

    # Re-validate date ordering after updates
    if cycle.end_date <= cycle.start_date:
        raise HTTPException(status_code=422, detail="end_date must be after start_date")

    cycle = await CycleRepository(session).update(cycle)
    await session.commit()
    return CycleResponse.model_validate(cycle)


@router.delete("/{cycle_id}", status_code=204)
async def archive_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    """Archive a cycle (soft-delete via status)."""
    await _get_project_accessible(project_id, current_user, session, need_lead=True)
    cycle = await _get_cycle(project_id, cycle_id, session, tenant_id=current_user.tenant_id)
    cycle.status = "archived"
    await CycleRepository(session).update(cycle)
    await session.commit()


@router.post("/{cycle_id}/tasks", response_model=TaskResponse, status_code=201)
async def add_task_to_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    req: CycleTaskAdd,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    await _get_project_accessible(project_id, current_user, session, need_lead=True)
    cycle = await _get_cycle(project_id, cycle_id, session, tenant_id=current_user.tenant_id)

    # Validate task exists, belongs to same project + tenant
    task = await session.get(Task, req.task_id)
    if not task or task.project_id != project_id or task.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check task is not already in a planned/active cycle
    repo = CycleRepository(session)
    if await repo.is_task_in_active_cycle(current_user.tenant_id, req.task_id):
        raise HTTPException(status_code=409, detail="Task is already in a planned or active cycle")

    ct = CycleTask(
        tenant_id=current_user.tenant_id,
        cycle_id=cycle.id,
        task_id=req.task_id,
        added_by=current_user.id,
    )
    await repo.add_task(ct)
    await session.commit()
    return TaskResponse.model_validate(task)


@router.delete("/{cycle_id}/tasks/{task_id}", status_code=204)
async def remove_task_from_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    await _get_project_accessible(project_id, current_user, session, need_lead=True)
    await _get_cycle(project_id, cycle_id, session, tenant_id=current_user.tenant_id)
    await CycleRepository(session).remove_task(cycle_id, task_id)
    await session.commit()


@router.post("/{cycle_id}/close", response_model=CycleCloseResponse)
async def close_cycle(
    project_id: uuid.UUID,
    cycle_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("projects:write")),
):
    """Close a cycle: set status=completed, return incomplete tasks."""
    await _get_project_accessible(project_id, current_user, session, need_lead=True)
    cycle = await _get_cycle(project_id, cycle_id, session, tenant_id=current_user.tenant_id)

    if cycle.status not in ("active", "planned"):
        raise HTTPException(status_code=422, detail="Only active or planned cycles can be closed")

    cycle.status = "completed"
    cycle.closed_at = utcnow()
    repo = CycleRepository(session)
    cycle = await repo.update(cycle)

    # Fetch tasks and separate incomplete ones
    tasks = await repo.get_cycle_tasks(cycle_id)
    done_statuses = {TaskStatus.done, TaskStatus.archived}
    incomplete = [t for t in tasks if t.status not in done_statuses]

    await session.commit()
    return CycleCloseResponse(
        cycle=CycleResponse.model_validate(cycle),
        incomplete_tasks=[TaskResponse.model_validate(t) for t in incomplete],
    )
