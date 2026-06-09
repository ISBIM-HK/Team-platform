"""Per-task implementation hint (附录 I.2) — one concise, basic suggestion.

Uses the cheap LLM tier via Pi sidecar. Pure function: task text in, one-line hint out.
"""

from __future__ import annotations

import time

from src.core.config import get_settings

IMPL_HINT_SYSTEM_PROMPT = """你是资深工程师。针对给定的单个任务,给出**一条最基本**的实现思路:
一两句话,可直接上手、不啰嗦、不要展开成清单或分点。只输出这条思路本身,中文。"""


async def suggest_impl_hint(task_title: str, task_description: str = "", record=None) -> str:
    from src.ai.runtime import pi_completion

    model_name = get_settings().llm_model_cheap
    messages = [
        {"role": "system", "content": IMPL_HINT_SYSTEM_PROMPT},
        {"role": "user", "content": f"任务:{task_title}\n描述:{task_description or '(无)'}"},
    ]

    t0 = time.monotonic()
    content = await pi_completion(messages, model=model_name)
    latency_ms = int((time.monotonic() - t0) * 1000)

    if record is not None:
        from src.ai.usage import record_usage

        await record_usage(record, model_name, 0, 0, latency_ms)
    return content
