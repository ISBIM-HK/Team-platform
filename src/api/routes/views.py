"""Saved views — user-defined task filter/sort/group presets."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from src.api.deps import CurrentUser, DBSession, require_any_scope, require_scope
from src.models.common import TaskStatus, utcnow
from src.models.saved_view import SavedView
from src.models.task import Task
from src.repositories.project_member_repo import ProjectMemberRepository
from src.repositories.saved_view_repo import SavedViewRepository
from src.schemas.task import TaskResponse

router = APIRouter(tags=["views"])

# ─── config validation ───

ALLOWED_FILTER_FIELDS = frozenset(
    {
        "status",
        "owner_user_id",
        "priority",
        "parent_task_id",
        "cycle_id",
        "due_before",
        "due_after",
        "overdue",
    }
)

DONE_STATUSES = {TaskStatus.done, TaskStatus.archived}


def _validate_config(config: dict) -> None:
    """Reject unknown filter keys with 422."""
    filters = config.get("filters", {})
    if not isinstance(filters, dict):
        raise HTTPException(status_code=422, detail="config.filters must be an object")
    unknown = set(filters.keys()) - ALLOWED_FILTER_FIELDS
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown filter fields: {', '.join(sorted(unknown))}",
        )


# ─── schemas ───


class ViewCreate(BaseModel):
    name: str
    project_id: uuid.UUID | None = None
    visibility: str = "private"
    resource_type: str = "tasks"
    config: dict
    position: int = 0


class ViewUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None
    visibility: str | None = None
    position: int | None = None


class ViewResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    project_id: uuid.UUID | None
    owner_user_id: uuid.UUID
    name: str
    visibility: str
    resource_type: str
    config: dict
    config_version: int
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── helpers ───


def _privileged(current_user) -> bool:
    return bool(current_user.is_pm or current_user.is_admin)


async def _can_update_view(view: SavedView, current_user, session) -> None:
    """Owner can always update. For project views, lead+ can also update."""
    if view.owner_user_id == current_user.id:
        return
    if _privileged(current_user):
        return
    if view.visibility == "project" and view.project_id:
        role = await ProjectMemberRepository(session).role_of(view.project_id, current_user.id)
        if role == "lead":
            return
    raise HTTPException(status_code=404, detail="View not found")


# ─── routes: /me/views ───


@router.get("/me/views", response_model=list[ViewResponse])
async def list_my_views(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("tasks:read", "tasks:write")),
):
    """List all personal views for the current user."""
    repo = SavedViewRepository(session)
    views = await repo.list_by_owner(current_user.tenant_id, current_user.id)
    return [ViewResponse.model_validate(v) for v in views]


@router.post("/me/views", response_model=ViewResponse, status_code=201)
async def create_view(
    req: ViewCreate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("tasks:write")),
):
    """Create a personal saved view."""
    _validate_config(req.config)
    if req.visibility not in ("private", "project"):
        raise HTTPException(status_code=422, detail="visibility must be private|project")
    if req.visibility == "project" and not req.project_id:
        raise HTTPException(status_code=422, detail="project_id required for project visibility")

    view = SavedView(
        tenant_id=current_user.tenant_id,
        project_id=req.project_id,
        owner_user_id=current_user.id,
        name=req.name,
        visibility=req.visibility,
        resource_type=req.resource_type,
        config=req.config,
        position=req.position,
    )
    repo = SavedViewRepository(session)
    view = await repo.create(view)
    await session.commit()
    return ViewResponse.model_validate(view)


# ─── routes: /views/{id} ───


@router.patch("/views/{view_id}", response_model=ViewResponse)
async def update_view(
    view_id: uuid.UUID,
    req: ViewUpdate,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("tasks:write")),
):
    """Update a saved view (owner only, or lead+ for project views)."""
    repo = SavedViewRepository(session)
    view = await repo.get_by_id(view_id)
    if not view or view.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="View not found")

    await _can_update_view(view, current_user, session)

    if req.config is not None:
        _validate_config(req.config)
        view.config = req.config
    if req.name is not None:
        view.name = req.name
    if req.visibility is not None:
        if req.visibility not in ("private", "project"):
            raise HTTPException(status_code=422, detail="visibility must be private|project")
        if req.visibility == "project" and not view.project_id:
            raise HTTPException(status_code=422, detail="project_id required for project visibility")
        view.visibility = req.visibility
    if req.position is not None:
        view.position = req.position

    view = await repo.update(view)
    await session.commit()
    return ViewResponse.model_validate(view)


@router.delete("/views/{view_id}", status_code=204)
async def delete_view(
    view_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("tasks:write")),
):
    """Delete a saved view (owner only)."""
    repo = SavedViewRepository(session)
    view = await repo.get_by_id(view_id)
    if not view or view.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="View not found")
    if view.owner_user_id != current_user.id and not _privileged(current_user):
        raise HTTPException(status_code=404, detail="View not found")

    await repo.delete(view_id)
    await session.commit()


# ─── routes: /views/{id}/tasks — execute the view filter ───


@router.get("/views/{view_id}/tasks", response_model=list[TaskResponse])
async def execute_view(
    view_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_any_scope("tasks:read", "tasks:write")),
):
    """Execute a saved view's config and return filtered tasks."""
    repo = SavedViewRepository(session)
    view = await repo.get_by_id(view_id)
    if not view or view.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="View not found")

    # Access: owner sees own views; project views visible to project members + privileged
    if view.owner_user_id != current_user.id:
        if view.visibility != "project":
            raise HTTPException(status_code=404, detail="View not found")
        if not _privileged(current_user) and view.project_id:
            is_member = await ProjectMemberRepository(session).is_member(view.project_id, current_user.id)
            if not is_member:
                raise HTTPException(status_code=404, detail="View not found")

    config = view.config or {}
    filters = config.get("filters", {})

    stmt = select(Task).where(Task.tenant_id == current_user.tenant_id)

    # Scope to project if the view is project-scoped
    if view.project_id:
        stmt = stmt.where(Task.project_id == view.project_id)

    # Apply filters
    if "status" in filters:
        statuses = filters["status"]
        if isinstance(statuses, list):
            stmt = stmt.where(Task.status.in_(statuses))
        else:
            stmt = stmt.where(Task.status == statuses)

    if "owner_user_id" in filters:
        owner_val = filters["owner_user_id"]
        if owner_val == "me":
            stmt = stmt.where(Task.owner_user_id == current_user.id)
        else:
            stmt = stmt.where(Task.owner_user_id == uuid.UUID(str(owner_val)))

    if "priority" in filters:
        priorities = filters["priority"]
        if isinstance(priorities, list):
            stmt = stmt.where(Task.priority.in_(priorities))
        else:
            stmt = stmt.where(Task.priority == priorities)

    if "parent_task_id" in filters:
        val = filters["parent_task_id"]
        if val is None:
            stmt = stmt.where(Task.parent_task_id.is_(None))
        else:
            stmt = stmt.where(Task.parent_task_id == uuid.UUID(str(val)))

    if "cycle_id" in filters:
        # cycle_id is a future field — no-op for now but accepted in the whitelist
        pass

    if "due_before" in filters:
        stmt = stmt.where(Task.due_date < filters["due_before"])

    if "due_after" in filters:
        stmt = stmt.where(Task.due_date > filters["due_after"])

    if "overdue" in filters and filters["overdue"]:
        now = utcnow()
        stmt = stmt.where(
            Task.due_date < now.date(),
            Task.status.notin_([TaskStatus.done, TaskStatus.archived]),
        )

    # Apply sort
    sort_field = config.get("sort", "created_at")
    sort_dir = config.get("sort_dir", "desc")
    sort_column = getattr(Task, sort_field, Task.created_at)
    if sort_dir == "asc":
        stmt = stmt.order_by(sort_column.asc())
    else:
        stmt = stmt.order_by(sort_column.desc())

    # Apply group_by (for ordering purposes — actual grouping is client-side)
    group_by = config.get("group_by")
    if group_by:
        group_column = getattr(Task, group_by, None)
        if group_column is not None:
            stmt = stmt.order_by(group_column.asc())

    stmt = stmt.limit(200)

    result = await session.execute(stmt)
    tasks = list(result.scalars().all())
    return [TaskResponse.model_validate(t) for t in tasks]
