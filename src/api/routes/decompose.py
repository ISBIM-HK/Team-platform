"""Decomposition route — goal → AI plan → suggestion."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.api.deps import CurrentUser, DBSession
from src.ai.decompose import decompose_goal
from src.ai.usage import RecordCtx
from src.models.ai_suggestion import AISuggestion
from src.models.common import LLMTrigger, SuggestionStatus, SuggestionType
from src.repositories.suggestion_repo import SuggestionRepository
from src.repositories.user_repo import UserRepository

router = APIRouter(prefix="/decompose", tags=["decompose"])


class DecomposeRequest(BaseModel):
    goal: str
    """The high-level goal or requirement to decompose."""


class DecomposeResponse(BaseModel):
    suggestion_id: str
    plan: dict
    message: str


@router.post("", response_model=DecomposeResponse)
async def trigger_decomposition(
    req: DecomposeRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    """Decompose a goal into subtasks via AI, create a suggestion for review."""
    # Build team context from tenant members
    user_repo = UserRepository(session)
    members = await user_repo.list_by_tenant(current_user.tenant_id)
    team_lines = []
    for m in members:
        role = "PM" if m.is_pm else "成员"
        team_lines.append(f"- {m.display_name}（{role}，ID: {m.id}）")
    team_context = "## 团队成员\n" + "\n".join(team_lines) if team_lines else ""

    # Run AI decomposition (record cost to llm_calls)
    rec = RecordCtx(session=session, tenant_id=current_user.tenant_id,
                    user_id=current_user.id, trigger=LLMTrigger.dispatch)
    try:
        plan = await decompose_goal(req.goal, team_context, record=rec)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI decomposition failed: {e}")

    # Build suggestion target_ref with the full plan
    target_ref = {
        "title": plan.title,
        "description": plan.description,
        "priority": 1,
        "subtasks": [
            {
                "title": st.title,
                "description": st.description,
                "priority": st.priority,
                "estimated_hours": st.estimated_hours,
                "owner_user_id": None,  # Will be filled when user accepts
            }
            for st in plan.subtasks
        ],
    }

    # Create suggestion
    suggestion_repo = SuggestionRepository(session)
    suggestion = AISuggestion(
        tenant_id=current_user.tenant_id,
        suggestion_type=SuggestionType.decompose,
        target_user_id=current_user.id,
        target_ref=target_ref,
        rationale=plan.rationale,
        confidence=plan.confidence,
        based_on_events=[],
        status=SuggestionStatus.pending,
    )
    await suggestion_repo.create(suggestion)

    return DecomposeResponse(
        suggestion_id=str(suggestion.id),
        plan=target_ref,
        message=f"AI 拆解完成，{len(plan.subtasks)} 个子任务待确认",
    )
