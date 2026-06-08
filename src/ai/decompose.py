"""Task decomposition agent using PydanticAI.

Takes a goal/requirement text + optional team context,
outputs a structured DecompositionPlan.
"""

from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.deepseek import DeepSeekProvider

from src.ai.schemas import DecompositionPlan
from src.core.config import get_settings


def resolve_model(model_str: str) -> Model | str:
    """Wire the configured API key to the provider.

    'deepseek:<name>' → explicit DeepSeekProvider with settings.llm_api_key.
    Anything else → pass through to PydanticAI's own inference (reads env).
    """
    settings = get_settings()
    if model_str.startswith("deepseek:") and settings.llm_api_key:
        name = model_str.split(":", 1)[1]
        return OpenAIChatModel(name, provider=DeepSeekProvider(api_key=settings.llm_api_key))
    if model_str.startswith("deepseek-") and settings.llm_api_key:
        return OpenAIChatModel(model_str, provider=DeepSeekProvider(api_key=settings.llm_api_key))
    return model_str


# System prompt for the decomposition agent
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


def get_decompose_agent(model: str | None = None) -> Agent[None, DecompositionPlan]:
    """Create a decomposition agent.

    Decomposition is reasoning-heavy → use the strong model by default
    (设计 §5.1 + R1：拆解用 Pro 不省钱).
    """
    return Agent(
        resolve_model(model or get_settings().llm_model_strong),
        system_prompt=DECOMPOSE_SYSTEM_PROMPT,
        output_type=DecompositionPlan,
        retries=2,
    )


async def decompose_goal(
    goal: str,
    team_context: str = "",
    model: str | None = None,
    record=None,
) -> DecompositionPlan:
    """Decompose a goal into a plan with subtasks.

    Args:
        goal: The high-level goal or requirement text.
        team_context: Optional context about team members, skills, current workload.
        model: Override model string; defaults to settings.llm_model_strong.
        record: Optional usage.RecordCtx; when given, the LLM call is logged to llm_calls.

    Returns:
        DecompositionPlan with parent task info + list of subtasks.
    """
    import time

    model_name = model or get_settings().llm_model_strong
    agent = get_decompose_agent(model)

    user_prompt = f"## 目标\n{goal}"
    if team_context:
        user_prompt += f"\n\n## 团队上下文\n{team_context}"

    t0 = time.monotonic()
    result = await agent.run(user_prompt)
    if record is not None:
        from src.ai.usage import record_run

        await record_run(record, result, model_name, int((time.monotonic() - t0) * 1000))
    return result.output
