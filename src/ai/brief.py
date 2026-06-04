"""Project progress brief — aggregate tasks + contributions into a
colleague-readable summary (on-demand, for the share page)."""

from __future__ import annotations

import time

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from src.ai.decompose import resolve_model
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


def _agent() -> Agent[None, ProgressBrief]:
    return Agent(
        resolve_model(get_settings().llm_model_strong),
        system_prompt=BRIEF_SYSTEM_PROMPT,
        output_type=ProgressBrief,
        retries=1,
    )


async def generate_brief(context: str, record=None) -> ProgressBrief:
    t0 = time.monotonic()
    result = await _agent().run(context)
    if record is not None:
        from src.ai.usage import record_run

        await record_run(record, result, get_settings().llm_model_strong, int((time.monotonic() - t0) * 1000))
    return result.output
