"""Smart dispatch — recommend an owner for a task.

Advisory only: the route wraps the result in an `assign` suggestion;
nothing is auto-assigned (pull mode preserved).
"""

from __future__ import annotations

import json

from src.ai.schemas import AssignmentSuggestion
from src.core.config import get_settings

DISPATCH_SYSTEM_PROMPT = """你是技术团队负责人，为一个待办任务推荐最合适的负责人。

## 规则
1. 只能从给定的成员列表里选，user_id 必须原样来自列表，不得编造
2. 综合考虑：成员当前负载（手头未完成任务数，越低越好）+ 与任务的匹配度
3. rationale 要具体引用负载和匹配理由，不要空话
4. 信息不足以判断匹配度时，主要看负载，并降低 confidence
5. confidence: 0.8+ 很有把握；0.6~0.8 基本合理；<0.6 信息不足
"""


def _schema_instruction() -> str:
    schema = AssignmentSuggestion.model_json_schema()
    return (
        "\n\n请严格按以下 JSON Schema 返回，不要包含任何其他文字：\n"
        f"```json\n{json.dumps(schema, ensure_ascii=False, indent=2)}\n```"
    )


async def suggest_assignment(
    task_title: str,
    task_description: str,
    members: list[dict],
    record=None,
) -> AssignmentSuggestion:
    """Recommend an assignee for a task."""
    import time

    from src.ai.runtime import pi_completion

    model_name = get_settings().llm_model_strong
    prompt = (
        f"## 待分配任务\n标题：{task_title}\n描述：{task_description or '（无）'}\n\n"
        f"## 候选成员（含当前未完成任务数）\n{json.dumps(members, ensure_ascii=False, indent=2)}"
    )

    messages = [
        {"role": "system", "content": DISPATCH_SYSTEM_PROMPT + _schema_instruction()},
        {"role": "user", "content": prompt},
    ]

    t0 = time.monotonic()
    content = await pi_completion(messages, model=model_name)
    latency_ms = int((time.monotonic() - t0) * 1000)

    suggestion = AssignmentSuggestion.model_validate_json(content)

    if record is not None:
        from src.ai.usage import record_usage

        await record_usage(record, model_name, 0, 0, latency_ms)
    return suggestion
