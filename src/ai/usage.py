"""LLM cost/usage recording.

Every LLM call should be recorded to llm_calls (metadata only — no prompt/
response text, per design §1.2 privacy boundary) for cost observability.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.common import LLMStatus, LLMTrigger
from src.models.llm_call import LLMCall

# USD per 1M tokens (input, output) — 占位价，待按真实 DeepSeek V4 计费核定
_PRICE: dict[str, tuple[float, float]] = {
    "pro": (0.27, 1.10),
    "flash": (0.07, 0.28),
}


def _rate(model: str) -> tuple[float, float]:
    return _PRICE["pro"] if "pro" in model.lower() else _PRICE["flash"]


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    pin, pout = _rate(model)
    return round(tokens_in / 1e6 * pin + tokens_out / 1e6 * pout, 6)


@dataclass
class RecordCtx:
    session: AsyncSession
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    trigger: LLMTrigger
    triggered_by_id: uuid.UUID | None = None


async def record_run(ctx: RecordCtx, result, model: str, latency_ms: int,
                     status: LLMStatus = LLMStatus.ok) -> LLMCall:
    """Record one PydanticAI run's usage. `result` is an AgentRunResult."""
    usage = result.usage  # pydantic-ai 1.x: property, not a method
    tin = usage.input_tokens or 0
    tout = usage.output_tokens or 0
    call = LLMCall(
        tenant_id=ctx.tenant_id,
        triggered_by=ctx.trigger,
        triggered_by_id=ctx.triggered_by_id,
        user_id=ctx.user_id,
        model=model,
        tokens_in=tin,
        tokens_out=tout,
        cost_usd=estimate_cost(model, tin, tout),
        latency_ms=latency_ms,
        status=status,
    )
    ctx.session.add(call)
    await ctx.session.flush()
    return call
