"""Internal tool bridge — Pi sidecar calls these to execute tools in Python.

NOT exposed to end users. Authenticated by X-Internal-Secret header.
"""

import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from src.api.deps import DBSession
from src.core.config import get_settings

router = APIRouter(prefix="/internal/agent-tools", tags=["internal"])


class ToolRequest(BaseModel):
    args: dict
    meta: dict  # user_id, tenant_id, project_id, session_id


class ToolResponse(BaseModel):
    data: str | dict | list
    details: dict = {}
    error: bool = False


def _verify_secret(secret: str) -> None:
    expected = get_settings().internal_secret
    if not expected or secret != expected:
        raise HTTPException(status_code=403, detail="Invalid internal secret")


def _deps_from_meta(session, meta: dict):
    from src.ai.tools import AssistantDeps

    return AssistantDeps(
        session=session,
        user_id=uuid.UUID(meta["user_id"]),
        tenant_id=uuid.UUID(meta["tenant_id"]),
        current_project_id=uuid.UUID(meta["project_id"]) if meta.get("project_id") else None,
    )


@router.get("", summary="List all tool schemas for Pi sidecar dynamic discovery")
async def list_tools(x_internal_secret: str = Header("")):
    """Returns OpenAI function-calling schemas for all tools + the system prompt template."""
    _verify_secret(x_internal_secret)

    from src.ai.assistant import ASSISTANT_SYSTEM_PROMPT, TOOL_GROUPS, _get_all_tools
    from src.ai.tools import build_tool_schema

    tool_keywords: dict[str, list[str]] = {}
    for group in TOOL_GROUPS.values():
        for name in group["read"] + group["write"]:
            tool_keywords.setdefault(name, []).extend(group["keywords"])

    all_tools = _get_all_tools()
    schemas = []
    for fn in all_tools.values():
        schema = build_tool_schema(fn)
        name = schema["function"]["name"]
        if name in tool_keywords:
            schema["function"]["keywords"] = tool_keywords[name]
        schemas.append(schema)
    return {"tools": schemas, "system_prompt": ASSISTANT_SYSTEM_PROMPT}


@router.post("/{tool_name}", response_model=ToolResponse)
async def execute_tool(
    tool_name: str,
    req: ToolRequest,
    session: DBSession,
    x_internal_secret: str = Header(""),
):
    _verify_secret(x_internal_secret)

    from src.ai.assistant import _get_all_tools

    all_tools = _get_all_tools()
    fn = all_tools.get(tool_name)
    if not fn:
        raise HTTPException(status_code=404, detail=f"Unknown tool: {tool_name}")

    deps = _deps_from_meta(session, req.meta)

    try:
        result = await fn(deps, **req.args)
        await session.commit()
        return ToolResponse(data=result)
    except Exception as e:
        return ToolResponse(data=str(e), error=True)
