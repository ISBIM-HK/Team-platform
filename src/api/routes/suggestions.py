"""Suggestion routes — list, accept, reject.

Accept logic per suggestion_type:
- create_task: creates a single Task
- decompose: creates parent Task + child Tasks from target_ref.subtasks
- assign: updates existing Task.owner_user_id
- Others: reject with error (not yet implemented)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from src.api.deps import CurrentUser, DBSession
from src.models.common import SuggestionStatus, SuggestionType, TaskPriority
from src.models.project import Project
from src.models.task import Task
from src.repositories.project_repo import ProjectRepository
from src.repositories.suggestion_repo import SuggestionRepository
from src.repositories.task_repo import TaskRepository
from src.schemas.suggestion import (
    AcceptResponse,
    RejectRequest,
    SuggestionListResponse,
    SuggestionResponse,
)

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


@router.get("", response_model=SuggestionListResponse)
async def list_suggestions(
    current_user: CurrentUser,
    session: DBSession,
    status: SuggestionStatus | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    repo = SuggestionRepository(session)
    # PM can see all pending; members see only their own
    if current_user.is_pm and status == SuggestionStatus.pending:
        items = await repo.list_pending(current_user.tenant_id, limit=limit, offset=offset)
    else:
        items = await repo.list_by_user(
            current_user.id, status=status, limit=limit, offset=offset
        )
    return SuggestionListResponse(
        items=[SuggestionResponse.model_validate(i) for i in items],
        total=len(items),
    )


@router.post("/{suggestion_id}/accept", response_model=AcceptResponse)
async def accept_suggestion(
    suggestion_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    repo = SuggestionRepository(session)
    suggestion = await repo.get_by_id(suggestion_id)

    if not suggestion or suggestion.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if suggestion.status != SuggestionStatus.pending:
        raise HTTPException(status_code=422, detail=f"Already {suggestion.status.value}")
    # Only target user or PM can accept
    if suggestion.target_user_id != current_user.id and not current_user.is_pm:
        raise HTTPException(status_code=403, detail="Not authorized")

    task_repo = TaskRepository(session)
    prepo = ProjectRepository(session)
    created_task_ids: list[uuid.UUID] = []

    async def _resolve_project(ref: dict) -> uuid.UUID:
        """ref.project_name → new project; ref.project_id → existing; else Inbox."""
        if ref.get("project_name"):
            proj = await prepo.create(Project(
                tenant_id=current_user.tenant_id, name=ref["project_name"],
                description=ref.get("description", ""), status="active",
                created_by=current_user.id,
            ))
            return proj.id
        if ref.get("project_id"):
            return uuid.UUID(ref["project_id"])
        return (await prepo.ensure_inbox(current_user.tenant_id)).id

    if suggestion.suggestion_type == SuggestionType.create_task:
        ref = suggestion.target_ref or {}
        task = Task(
            tenant_id=current_user.tenant_id,
            project_id=await _resolve_project(ref),
            title=ref.get("title", "Untitled"),
            description=ref.get("description", ""),
            priority=TaskPriority(ref.get("priority", 1)),
            owner_user_id=suggestion.target_user_id or current_user.id,
            created_by=f"ai_auto:suggestion:{suggestion.id}",
            tags=ref.get("tags"),
            estimated_hours=ref.get("estimated_hours"),
        )
        await task_repo.create(task)
        created_task_ids.append(task.id)

    elif suggestion.suggestion_type == SuggestionType.decompose:
        ref = suggestion.target_ref or {}
        project_id = await _resolve_project(ref)
        # Create parent task
        parent = Task(
            tenant_id=current_user.tenant_id,
            project_id=project_id,
            title=ref.get("title", "Decomposed Goal"),
            description=ref.get("description", ""),
            priority=TaskPriority(ref.get("priority", 1)),
            owner_user_id=current_user.id,
            created_by=f"ai_auto:suggestion:{suggestion.id}",
        )
        await task_repo.create(parent)
        created_task_ids.append(parent.id)

        # Create subtasks
        subtasks = ref.get("subtasks", [])
        for st in subtasks:
            child = Task(
                tenant_id=current_user.tenant_id,
                project_id=project_id,
                title=st.get("title", "Subtask"),
                description=st.get("description", ""),
                priority=TaskPriority(st.get("priority", 1)),
                owner_user_id=uuid.UUID(st["owner_user_id"]) if st.get("owner_user_id") else None,
                created_by=f"ai_auto:suggestion:{suggestion.id}",
                parent_task_id=parent.id,
                estimated_hours=st.get("estimated_hours"),
            )
            await task_repo.create(child)
            created_task_ids.append(child.id)

    elif suggestion.suggestion_type == SuggestionType.assign:
        ref = suggestion.target_ref or {}
        task_id = ref.get("task_id")
        if not task_id:
            raise HTTPException(status_code=422, detail="Missing task_id in target_ref")
        task = await task_repo.get_by_id(uuid.UUID(task_id))
        if not task or task.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=404, detail="Referenced task not found")
        task.owner_user_id = suggestion.target_user_id
        task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(task)
        await session.flush()
        created_task_ids.append(task.id)

    else:
        raise HTTPException(
            status_code=422,
            detail=f"Accept not yet implemented for {suggestion.suggestion_type.value}",
        )

    await repo.accept(suggestion, current_user.id)

    return AcceptResponse(
        suggestion_id=suggestion.id,
        status="accepted",
        created_tasks=created_task_ids,
        message=f"Created {len(created_task_ids)} task(s)",
    )


@router.post("/{suggestion_id}/reject", response_model=SuggestionResponse)
async def reject_suggestion(
    suggestion_id: uuid.UUID,
    req: RejectRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    repo = SuggestionRepository(session)
    suggestion = await repo.get_by_id(suggestion_id)

    if not suggestion or suggestion.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if suggestion.status != SuggestionStatus.pending:
        raise HTTPException(status_code=422, detail=f"Already {suggestion.status.value}")

    await repo.reject(suggestion, current_user.id, req.reason)
    return SuggestionResponse.model_validate(suggestion)
