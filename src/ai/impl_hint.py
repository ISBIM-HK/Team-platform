"""Per-task implementation hint (附录 I.2) — one concise, basic suggestion.

Uses the cheap LLM tier (DeepSeek v4 Flash). Pure function: task text in,
one-line hint out. Records cost to llm_calls via the optional record context.
"""

from __future__ import annotations

import time

from pydantic_ai import Agent

from src.ai.decompose import resolve_model
from src.core.config import get_settings

IMPL_HINT_SYSTEM_PROMPT = """你是资深工程师。针对给定的单个任务,给出**一条最基本**的实现思路:
一两句话,可直接上手、不啰嗦、不要展开成清单或分点。只输出这条思路本身,中文。"""


def _agent() -> Agent[None, str]:
    return Agent(
        resolve_model(get_settings().llm_model_cheap),
        system_prompt=IMPL_HINT_SYSTEM_PROMPT,
        output_type=str,
        retries=1,
    )


async def suggest_impl_hint(task_title: str, task_description: str = "", record=None) -> str:
    t0 = time.monotonic()
    ctx = f"任务:{task_title}\n描述:{task_description or '(无)'}"
    result = await _agent().run(ctx)
    if record is not None:
        from src.ai.usage import record_run

        await record_run(
            record, result, get_settings().llm_model_cheap, int((time.monotonic() - t0) * 1000)
        )
    return result.output
