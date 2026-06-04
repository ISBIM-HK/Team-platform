"""PM-only observability routes."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from src.api.deps import CurrentUser, DBSession, require_scope
from src.models.llm_call import LLMCall

router = APIRouter(prefix="/pm", tags=["pm"])


class TriggerUsage(BaseModel):
    trigger: str
    calls: int
    tokens_in: int
    tokens_out: int
    cost_usd: float


class UserModelUsage(BaseModel):
    user_id: str
    user_name: str
    model: str
    calls: int
    tokens_in: int
    tokens_out: int
    cost_usd: float


class LLMUsageResponse(BaseModel):
    since: str
    total_calls: int
    total_tokens_in: int
    total_tokens_out: int
    total_cost_usd: float
    by_trigger: list[TriggerUsage]
    by_user_model: list[UserModelUsage]


@router.get("/llm-usage", response_model=LLMUsageResponse)
async def llm_usage(
    current_user: CurrentUser,
    session: DBSession,
    _scope: None = Depends(require_scope("pm")),
):
    """Today's (UTC) LLM cost/token usage for the tenant — cost observability."""
    if not current_user.is_pm:
        raise HTTPException(status_code=403, detail="PM only")

    since = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

    stmt = (
        select(
            LLMCall.triggered_by,
            func.count().label("calls"),
            func.coalesce(func.sum(LLMCall.tokens_in), 0),
            func.coalesce(func.sum(LLMCall.tokens_out), 0),
            func.coalesce(func.sum(LLMCall.cost_usd), 0.0),
        )
        .where(LLMCall.tenant_id == current_user.tenant_id, LLMCall.created_at >= since)
        .group_by(LLMCall.triggered_by)
    )

    rows = (await session.execute(stmt)).all()
    by_trigger = [
        TriggerUsage(trigger=r[0].value, calls=r[1], tokens_in=r[2], tokens_out=r[3], cost_usd=round(float(r[4]), 6))
        for r in rows
    ]

    # Per-user per-model breakdown
    from src.repositories.user_repo import UserRepository

    stmt2 = (
        select(
            LLMCall.user_id,
            LLMCall.model,
            func.count().label("calls"),
            func.coalesce(func.sum(LLMCall.tokens_in), 0),
            func.coalesce(func.sum(LLMCall.tokens_out), 0),
            func.coalesce(func.sum(LLMCall.cost_usd), 0.0),
        )
        .where(LLMCall.tenant_id == current_user.tenant_id, LLMCall.created_at >= since)
        .group_by(LLMCall.user_id, LLMCall.model)
        .order_by(func.coalesce(func.sum(LLMCall.cost_usd), 0.0).desc())
    )
    rows2 = (await session.execute(stmt2)).all()
    users = {u.id: u.display_name for u in await UserRepository(session).list_by_tenant(current_user.tenant_id)}
    by_user_model = [
        UserModelUsage(
            user_id=str(r[0]),
            user_name=users.get(r[0], "?"),
            model=r[1] or "?",
            calls=r[2],
            tokens_in=r[3],
            tokens_out=r[4],
            cost_usd=round(float(r[5]), 6),
        )
        for r in rows2
    ]

    return LLMUsageResponse(
        since=since.isoformat(),
        total_calls=sum(t.calls for t in by_trigger),
        total_tokens_in=sum(t.tokens_in for t in by_trigger),
        total_tokens_out=sum(t.tokens_out for t in by_trigger),
        total_cost_usd=round(sum(t.cost_usd for t in by_trigger), 6),
        by_trigger=by_trigger,
        by_user_model=by_user_model,
    )
