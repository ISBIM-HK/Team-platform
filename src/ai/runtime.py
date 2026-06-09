"""AgentRuntime — all LLM calls route through the Pi sidecar.

Pi (Node.js) owns LLM communication. Python owns business logic + DB + tools.
"""

from __future__ import annotations

import logging

import httpx

from src.core.config import get_settings

logger = logging.getLogger(__name__)


def _sidecar_url() -> str:
    return getattr(get_settings(), "pi_sidecar_url", "http://localhost:3200")


def _parse_model(model_str: str) -> tuple[str, str]:
    """Parse 'deepseek:deepseek-v4-flash' into (provider, model_id)."""
    if ":" in model_str:
        provider, model_id = model_str.split(":", 1)
        return provider, model_id
    if model_str.startswith("deepseek"):
        return "deepseek", model_str
    if model_str.startswith(("gpt", "o1", "o3")):
        return "openai", model_str
    if model_str.startswith("claude"):
        return "anthropic", model_str
    return "deepseek", model_str


def _transport() -> httpx.AsyncHTTPTransport:
    return httpx.AsyncHTTPTransport(proxy=None)


async def chat_turn_dispatch(
    user_message: str,
    history: list[dict],
    deps,
    record=None,
    *,
    restricted: bool = False,
    user_model: str | None = None,
    runtime: str | None = None,
) -> str:
    """Route a chat turn through the Pi sidecar."""
    import time

    from src.ai.assistant import _build_system_prompt

    settings = get_settings()
    model_name = user_model or settings.llm_model_cheap
    provider, model_id = _parse_model(model_name)

    system_prompt = await _build_system_prompt(deps, model_name)

    payload = {
        "message": user_message,
        "history": [{"role": m["role"], "content": m["content"]} for m in history],
        "system_prompt": system_prompt,
        "model_id": model_id,
        "provider": provider,
        "api_key": settings.llm_api_key,
        "user_id": str(deps.user_id),
        "tenant_id": str(deps.tenant_id),
        "project_id": str(deps.current_project_id) if deps.current_project_id else "",
    }

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=60.0, transport=_transport()) as client:
        resp = await client.post(f"{_sidecar_url()}/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()

    latency_ms = int((time.monotonic() - t0) * 1000)
    if record is not None:
        from src.ai.usage import record_usage

        await record_usage(record, model_name, 0, 0, latency_ms)

    return data.get("reply", "")


async def pi_completion(
    messages: list[dict],
    model: str | None = None,
    *,
    response_format: dict | None = None,
) -> str:
    """Simple one-shot LLM completion via Pi sidecar (no tools).

    Used by decompose, dispatch, impl_hint, brief.
    """
    settings = get_settings()
    model_name = model or settings.llm_model_cheap
    provider, model_id = _parse_model(model_name)

    payload: dict = {
        "messages": messages,
        "model_id": model_id,
        "provider": provider,
        "api_key": settings.llm_api_key,
    }
    if response_format:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=60.0, transport=_transport()) as client:
        resp = await client.post(f"{_sidecar_url()}/completion", json=payload)
        resp.raise_for_status()
        data = resp.json()

    return data.get("content", "")
