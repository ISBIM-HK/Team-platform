"""Task CRUD routes."""

import uuid
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from src.ai.dispatch import suggest_assignment
from src.ai.usage import RecordCtx
from src.api.deps import CurrentUser, DBSession
from src.models.ai_suggestion import AISuggestion
from src.models.common import LLMTrigger, SuggestionStatus, SuggestionType, TaskStatus, utcnow
from src.models.task import Task
from src.repositories.project_repo import ProjectRepository
from src.repositories.task_repo import TaskRepository
from src.repositories.user_repo import UserRepository
from src.schemas.task import (
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskUpdate,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Valid state transitions (from design doc)
VALID_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.todo: {TaskStatus.in_progress, TaskStatus.archived},
    TaskStatus.in_progress: {TaskStatus.blocked, TaskStatus.review, TaskStatus.done},
    TaskStatus.blocked: {TaskStatus.in_progress},
    TaskStatus.review: {TaskStatus.in_progress, TaskStatus.done},
    TaskStatus.done: {TaskStatus.archived},
    TaskStatus.archived: set(),
}


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    current_user: CurrentUser,
    session: DBSession,
    status: TaskStatus | None = Query(None),
    owner: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    repo = TaskRepository(session)
    tasks = await repo.list_by_tenant(
        current_user.tenant_id, status=status, owner_id=owner, limit=limit, offset=offset
    )
    total = await repo.count_by_tenant(current_user.tenant_id, status=status, owner_id=owner)
    return TaskListResponse(
        items=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
    )


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(req: TaskCreate, current_user: CurrentUser, session: DBSession):
    repo = TaskRepository(session)
    prepo = ProjectRepository(session)
    if req.project_id:
        proj = await prepo.get_by_id(req.project_id)
        if not proj or proj.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=404, detail="Project not found")
        project_id = proj.id
    else:
        project_id = (await prepo.ensure_inbox(current_user.tenant_id)).id
    task = Task(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        title=req.title,
        description=req.description,
        priority=req.priority,
        owner_user_id=req.owner_user_id or current_user.id,
        created_by=f"user:{current_user.id}",
        tags=req.tags,
        due_date=req.due_date,
        estimated_hours=req.estimated_hours,
        parent_task_id=req.parent_task_id,
    )
    await repo.create(task)
    return TaskResponse.model_validate(task)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    req: TaskUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    repo = TaskRepository(session)
    task = await repo.get_by_id(task_id)
    if not task or task.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Task not found")

    # Resource-level authz (§5.4): non-PM may only edit tasks they own or created
    is_owner = task.owner_user_id == current_user.id
    is_creator = task.created_by == f"user:{current_user.id}"
    if not (current_user.is_pm or is_owner or is_creator):
        raise HTTPException(status_code=403, detail="Not authorized to edit this task")

    # State machine enforcement
    if req.status and req.status != task.status:
        allowed = VALID_TRANSITIONS.get(task.status, set())
        if req.status not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot transition from {task.status.value} to {req.status.value}",
            )
        task = await repo.update_status(task, req.status, current_user.id)

    # Apply other field updates
    for field, value in req.model_dump(exclude_unset=True, exclude={"status"}).items():
        setattr(task, field, value)
    task.updated_at = utcnow()
    session.add(task)
    await session.flush()
    await session.refresh(task)

    return TaskResponse.model_validate(task)


@router.post("/{task_id}/claim", response_model=TaskResponse)
async def claim_task(task_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    repo = TaskRepository(session)
    task = await repo.claim_task(task_id, current_user.id)
    if not task:
        raise HTTPException(status_code=409, detail="Task already claimed or not found")
    return TaskResponse.model_validate(task)


class AssignSuggestResponse(BaseModel):
    suggestion_id: str
    suggested_user_id: str
    suggested_user_name: str
    rationale: str
    confidence: float


@router.post("/{task_id}/suggest-assignment", response_model=AssignSuggestResponse)
async def suggest_task_assignment(task_id: uuid.UUID, current_user: CurrentUser, session: DBSession):
    """PM-triggered AI dispatch: recommend an owner based on team load. Advisory (creates an assign suggestion)."""
    if not current_user.is_pm:
        raise HTTPException(status_code=403, detail="PM only")

    task_repo = TaskRepository(session)
    task = await task_repo.get_by_id(task_id)
    if not task or task.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Task not found")

    # Build team context with per-member open-task load
    members = await UserRepository(session).list_by_tenant(current_user.tenant_id)
    member_ctx = []
    by_id: dict[str, object] = {}
    for m in members:
        load = await task_repo.count_open_by_owner(current_user.tenant_id, m.id)
        member_ctx.append({"user_id": str(m.id), "name": m.display_name, "open_tasks": load})
        by_id[str(m.id)] = m
    if not member_ctx:
        raise HTTPException(status_code=422, detail="No team members to assign")

    rec = await suggest_assignment(
        task.title, task.description, member_ctx,
        record=RecordCtx(session=session, tenant_id=current_user.tenant_id,
                         user_id=current_user.id, trigger=LLMTrigger.dispatch,
                         triggered_by_id=task_id),
    )

    # Guard against a hallucinated user_id
    if rec.user_id not in by_id:
        raise HTTPException(status_code=502, detail="AI returned an unknown user_id")

    suggestion = AISuggestion(
        tenant_id=current_user.tenant_id,
        suggestion_type=SuggestionType.assign,
        target_user_id=uuid.UUID(rec.user_id),
        target_ref={"task_id": str(task_id)},
        rationale=rec.rationale,
        confidence=rec.confidence,
        status=SuggestionStatus.pending,
    )
    session.add(suggestion)
    await session.flush()
    await session.refresh(suggestion)

    return AssignSuggestResponse(
        suggestion_id=str(suggestion.id),
        suggested_user_id=rec.user_id,
        suggested_user_name=rec.user_name,
        rationale=rec.rationale,
        confidence=rec.confidence,
    )
