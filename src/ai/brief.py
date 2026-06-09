"""Project progress brief — aggregate tasks + contributions into a
colleague-readable summary (on-demand, for the share page)."""

from __future__ import annotations

import json
import time

from pydantic import BaseModel, Field

from src.core.config import get_settings

BRIEF_SYSTEM_PROMPT = """你是项目负责人,给同事写一份简洁的项目进展简报。
依据给定的任务清单(状态/负责人)、阻塞项、以及成员投送的工作痕迹,客观总结:
- summary:2~4 句的整体进展叙述(完成度、当前重心)
- highlights:已完成 / 明显进展(每条一句)
- risks:阻塞和风险(没有就空)
- next_steps:接下来该推进的(每条一句)
只基于给定信息,不编造;中文。"""


class ProgressBrief(BaseModel):
    summary: str = Field(description="2~4 句整体进展叙述")
    highlights: list[str] = Field(default_factory=list, description="已完成/进展亮点")
    risks: list[str] = Field(default_factory=list, description="阻塞/风险")
    next_steps: list[str] = Field(default_factory=list, description="下一步")


def _schema_instruction() -> str:
    schema = ProgressBrief.model_json_schema()
    return (
        "\n\n请严格按以下 JSON Schema 返回，不要包含任何其他文字：\n"
        f"```json\n{json.dumps(schema, ensure_ascii=False, indent=2)}\n```"
    )


async def generate_brief(context: str, record=None) -> ProgressBrief:
    from src.ai.runtime import pi_completion

    model_name = get_settings().llm_model_strong
    messages = [
        {"role": "system", "content": BRIEF_SYSTEM_PROMPT + _schema_instruction()},
        {"role": "user", "content": context},
    ]

    t0 = time.monotonic()
    content = await pi_completion(messages, model=model_name)
    latency_ms = int((time.monotonic() - t0) * 1000)

    brief = ProgressBrief.model_validate_json(content)

    if record is not None:
        from src.ai.usage import record_usage

        await record_usage(record, model_name, 0, 0, latency_ms)
    return brief
