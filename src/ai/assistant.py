"""Personal AI assistant agent.

Single PydanticAI agent with tools for each user.
Invoked per WebSocket message turn.
"""

from __future__ import annotations

from pydantic_ai import Agent, RunContext

from src.ai.decompose import resolve_model
from src.ai.tools import AssistantDeps
from src.core.config import get_settings


def workspace_prompt_section(ws) -> str:
    """Build the per-user persona/profile/memory block injected into the system prompt (附录 J.2)."""
    parts = []
    if (ws.persona_md or "").strip():
        parts.append("## 人格\n" + ws.persona_md.strip())
    if (ws.profile_md or "").strip():
        parts.append("## 关于用户\n" + ws.profile_md.strip())
    if (ws.memory_md or "").strip():
        parts.append("## 记忆\n" + ws.memory_md.strip())
    return "\n\n".join(parts)


def skills_prompt_section(skills) -> str:
    """Build the enabled-skills block for the system prompt (附录 J.5)."""
    enabled = [s for s in skills if s.enabled]
    if not enabled:
        return ""
    parts = ["## 技能"]
    for s in enabled:
        parts.append(f"### {s.name}\n{(s.instruction_md or '').strip()}")
    return "\n\n".join(parts)

ASSISTANT_SYSTEM_PROMPT = """你是 Team Platform 的个人 AI 助手。你的职责：
1. 帮用户查任务（自己的或团队的）
2. 帮用户记录手动工作
3. 帮用户创建任务建议
4. 把新需求拆解进当前项目（decompose_into_project，走建议确认）
5. 查看/改写任务的实现思路（get_task_impl_hint / update_task_impl_hint）
6. 记住重要信息与用户偏好（remember / note_about_user），跨会话保留
7. 回答工作相关问题

## 规则
- 简洁直接，不废话
- 用中文回复
- 不确定的信息不要编造
- 需要创建任务或拆解需求时，调用工具而不是直接告诉用户去操作
- 你不能直接修改任务状态或分配任务，只能创建建议；但可以改写任务的“实现思路”（仅参考、不改状态）
- 发现值得长期记住的事实或用户偏好时，主动用 remember / note_about_user 记下；记忆过长时用 rewrite_memory 压缩
- 发现可复用的做法/流程时，用 save_skill 把它沉淀成技能；已有技能用得不顺时用 improve_skill 改进
"""

def get_assistant_agent() -> Agent[AssistantDeps, str]:
    """Create the personal assistant agent with all tools registered.

    高频对话 → 默认便宜模型（Flash）；需要更强推理可改 llm_model_strong。
    """
    from src.ai.tools import (
        create_task_suggestion,
        decompose_into_project,
        get_task_impl_hint,
        improve_skill,
        log_manual_work,
        note_about_user,
        query_my_tasks,
        query_team_tasks,
        remember,
        rewrite_memory,
        save_skill,
        update_task_impl_hint,
    )

    agent = Agent(
        resolve_model(get_settings().llm_model_cheap),
        system_prompt=ASSISTANT_SYSTEM_PROMPT,
        deps_type=AssistantDeps,
        output_type=str,
        retries=1,
    )

    # Per-user persona/memory/profile injected each turn (附录 J.2)
    @agent.system_prompt
    async def _inject_workspace(ctx: RunContext[AssistantDeps]) -> str:
        from src.repositories.assistant_repo import AssistantWorkspaceRepository
        from src.repositories.assistant_skill_repo import AssistantSkillRepository

        ws = await AssistantWorkspaceRepository(ctx.deps.session).ensure(
            ctx.deps.tenant_id, ctx.deps.user_id
        )
        skills = await AssistantSkillRepository(ctx.deps.session).list_enabled(ws.id)
        sections = [workspace_prompt_section(ws), skills_prompt_section(skills)]
        return "\n\n".join(p for p in sections if p)

    # Register tools
    agent.tool(query_my_tasks)
    agent.tool(query_team_tasks)
    agent.tool(log_manual_work)
    agent.tool(create_task_suggestion)
    agent.tool(decompose_into_project)
    agent.tool(get_task_impl_hint)
    agent.tool(update_task_impl_hint)
    agent.tool(remember)
    agent.tool(note_about_user)
    agent.tool(rewrite_memory)
    agent.tool(save_skill)
    agent.tool(improve_skill)

    return agent


async def chat_turn(
    user_message: str,
    history: list[dict],
    deps: AssistantDeps,
    record=None,
) -> str:
    """Run one chat turn: user message → assistant response.

    Args:
        user_message: The user's input text.
        history: Previous messages as [{"role": "user"/"assistant", "content": "..."}].
        deps: Runtime dependencies (session, user_id, tenant_id).
        record: Optional usage.RecordCtx; when given, logs the call to llm_calls.

    Returns:
        Assistant's response text.
    """
    import time

    agent = get_assistant_agent()

    # Build message history + new user message
    messages = history + [{"role": "user", "content": user_message}]

    t0 = time.monotonic()
    result = await agent.run(
        user_prompt=user_message,
        message_history=_convert_history(messages[:-1]),  # exclude last user msg (it's the prompt)
        deps=deps,
    )
    if record is not None:
        from src.ai.usage import record_run
        await record_run(record, result, get_settings().llm_model_cheap,
                         int((time.monotonic() - t0) * 1000))
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
