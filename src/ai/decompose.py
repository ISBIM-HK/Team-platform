"""Task decomposition — structured output via Pi sidecar.

Takes a goal/requirement text + optional team context,
outputs a structured DecompositionPlan.
"""

from __future__ import annotations

import json

from src.ai.schemas import DecompositionPlan
from src.core.config import get_settings

DECOMPOSE_SYSTEM_PROMPT = """你是一个资深技术项目经理，擅长将复杂目标拆解为可执行的子任务。

## 规则
1. 每个子任务必须是**可独立执行**的——不能出现"设计+开发+测试"这种打包任务
2. 子任务标题必须是**动词开头**的行动项（实现/修复/设计/配置/调研...）
3. 估时要务实：单个子任务不超过 16 小时（2 个工作日），超过就要继续拆
4. 子任务之间如果有依赖关系，在 description 中注明"前置：XXX"
5. 如果目标太模糊（如"做个网站"），给出你最好的拆法并降低 confidence
6. 置信度打分标准：
   - 0.9+：目标明确、技术栈清晰、你非常确定拆法合理
   - 0.7-0.9：目标基本明确，部分细节需要确认
   - 0.5-0.7：目标模糊或你不确定技术方案
   - <0.5：信息严重不足，建议人工拆解

## 输出要求
- title：概括整个目标的一句话
- description：父任务的详细描述
- rationale：解释你为什么这样拆，每个子任务的选取逻辑
- subtasks：每条包含 title / description / priority / estimated_hours / suggested_owner_hint
"""


def _schema_instruction() -> str:
    schema = DecompositionPlan.model_json_schema()
    return (
        "\n\n请严格按以下 JSON Schema 返回，不要包含任何其他文字：\n"
        f"```json\n{json.dumps(schema, ensure_ascii=False, indent=2)}\n```"
    )


async def decompose_goal(
    goal: str,
    team_context: str = "",
    model: str | None = None,
    record=None,
) -> DecompositionPlan:
    """Decompose a goal into a plan with subtasks."""
    import time

    from src.ai.runtime import pi_completion

    model_name = model or get_settings().llm_model_strong

    user_prompt = f"## 目标\n{goal}"
    if team_context:
        user_prompt += f"\n\n## 团队上下文\n{team_context}"

    messages = [
        {"role": "system", "content": DECOMPOSE_SYSTEM_PROMPT + _schema_instruction()},
        {"role": "user", "content": user_prompt},
    ]

    t0 = time.monotonic()
    content = await pi_completion(messages, model=model_name)
    latency_ms = int((time.monotonic() - t0) * 1000)

    plan = DecompositionPlan.model_validate_json(content)

    if record is not None:
        from src.ai.usage import record_usage

        await record_usage(record, model_name, 0, 0, latency_ms)
    return plan
