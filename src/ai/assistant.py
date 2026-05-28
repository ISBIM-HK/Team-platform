"""Personal AI assistant agent.

Single PydanticAI agent with tools for each user.
Invoked per WebSocket message turn.
"""

from __future__ import annotations

from pydantic_ai import Agent

from src.ai.decompose import resolve_model
from src.ai.tools import AssistantDeps
from src.core.config import get_settings

ASSISTANT_SYSTEM_PROMPT = """你是 Team Platform 的个人 AI 助手。你的职责：
1. 帮用户查任务（自己的或团队的）
2. 帮用户记录手动工作
3. 帮用户创建任务建议
4. 回答工作相关问题

## 规则
- 简洁直接，不废话
- 用中文回复
- 不确定的信息不要编造
- 需要创建任务时，调用工具而不是直接告诉用户去操作
- 你不能直接修改任务状态或分配任务，只能创建建议
"""

def get_assistant_agent() -> Agent[AssistantDeps, str]:
    """Create the personal assistant agent with all tools registered.

    高频对话 → 默认便宜模型（Flash）；需要更强推理可改 llm_model_strong。
    """
    from src.ai.tools import create_task_suggestion, log_manual_work, query_my_tasks, query_team_tasks

    agent = Agent(
        resolve_model(get_settings().llm_model_cheap),
        system_prompt=ASSISTANT_SYSTEM_PROMPT,
        deps_type=AssistantDeps,
        output_type=str,
        retries=1,
    )

    # Register tools
    agent.tool(query_my_tasks)
    agent.tool(query_team_tasks)
    agent.tool(log_manual_work)
    agent.tool(create_task_suggestion)

    return agent


async def chat_turn(
    user_message: str,
    history: list[dict],
    deps: AssistantDeps,
) -> str:
    """Run one chat turn: user message → assistant response.

    Args:
        user_message: The user's input text.
        history: Previous messages as [{"role": "user"/"assistant", "content": "..."}].
        deps: Runtime dependencies (session, user_id, tenant_id).

    Returns:
        Assistant's response text.
    """
    agent = get_assistant_agent()

    # Build message history + new user message
    messages = history + [{"role": "user", "content": user_message}]

    result = await agent.run(
        user_prompt=user_message,
        message_history=_convert_history(messages[:-1]),  # exclude last user msg (it's the prompt)
        deps=deps,
    )
    return result.output


def _convert_history(messages: list[dict]) -> list:
    """Convert simple dict history to PydanticAI message format."""
    from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, UserPromptPart

    converted = []
    for m in messages:
        if m["role"] == "user":
            converted.append(ModelRequest(parts=[UserPromptPart(content=m["content"])]))
        elif m["role"] == "assistant":
            converted.append(ModelResponse(parts=[TextPart(content=m["content"])]))
    return converted
