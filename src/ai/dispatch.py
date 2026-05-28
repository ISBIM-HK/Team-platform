"""Smart dispatch agent — recommend an owner for a task.

Given a task + team members (with current load), suggests the most suitable
assignee. Advisory only: the route wraps the result in an `assign` suggestion;
nothing is auto-assigned (pull mode preserved).
"""

from __future__ import annotations

import json

from pydantic_ai import Agent

from src.ai.decompose import resolve_model
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


def get_dispatch_agent() -> Agent[None, AssignmentSuggestion]:
    return Agent(
        resolve_model(get_settings().llm_model_strong),
        system_prompt=DISPATCH_SYSTEM_PROMPT,
        output_type=AssignmentSuggestion,
        retries=2,
    )


async def suggest_assignment(
    task_title: str,
    task_description: str,
    members: list[dict],
) -> AssignmentSuggestion:
    """Recommend an assignee for a task.

    Args:
        task_title / task_description: the task to assign.
        members: [{"user_id": str, "name": str, "open_tasks": int}, ...]

    Returns:
        AssignmentSuggestion (user_id picked from members + rationale + confidence).
    """
    prompt = (
        f"## 待分配任务\n标题：{task_title}\n描述：{task_description or '（无）'}\n\n"
        f"## 候选成员（含当前未完成任务数）\n{json.dumps(members, ensure_ascii=False, indent=2)}"
    )
    result = await get_dispatch_agent().run(prompt)
    return result.output
