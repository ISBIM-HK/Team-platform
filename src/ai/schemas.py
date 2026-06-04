"""Structured output schemas for PydanticAI agents.

These are the Pydantic models that LLM responses are validated against.
"""

from pydantic import BaseModel, Field


class SubtaskSuggestion(BaseModel):
    """A single subtask proposed by the decomposition agent."""

    title: str = Field(description="子任务标题，简洁明确")
    description: str = Field(default="", description="子任务描述，包含验收标准")
    priority: int = Field(default=1, description="优先级：0=low, 1=normal, 2=high, 3=urgent")
    estimated_hours: float | None = Field(default=None, description="预估工时（小时）")
    suggested_owner_hint: str = Field(
        default="",
        description="建议负责人的特征描述，如'擅长前端的成员'、'有OAuth经验的人'，用于匹配团队成员",
    )


class DecompositionPlan(BaseModel):
    """AI output for task decomposition: goal → parent + subtasks."""

    title: str = Field(description="父任务标题")
    description: str = Field(description="父任务描述，概述整体目标")
    rationale: str = Field(description="为什么这样拆解的理由")
    confidence: float = Field(ge=0.0, le=1.0, description="对拆解质量的自评置信度")
    subtasks: list[SubtaskSuggestion] = Field(
        min_length=1,
        description="拆解出的子任务列表，每条必须可独立执行",
    )


class AssignmentSuggestion(BaseModel):
    """AI output for single-task assignment recommendation."""

    user_id: str = Field(description="建议分配给的用户 ID")
    user_name: str = Field(description="用户显示名")
    rationale: str = Field(description="为什么推荐这个人的理由")
    confidence: float = Field(ge=0.0, le=1.0)
