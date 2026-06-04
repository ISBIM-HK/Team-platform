"""Shared client core: config + the two calls every local client needs
(list projects to resolve a name → id, and push a contribution)."""

from __future__ import annotations

import os

import httpx

API_PREFIX = "/api/v1"
DEFAULT_URL = "http://localhost:3137"


class ClientError(Exception):
    pass


def _config() -> tuple[str, str]:
    token = os.environ.get("TEAMPLAT_TOKEN", "").strip()
    if not token:
        raise ClientError("缺少 TEAMPLAT_TOKEN(在平台「设置 → 个人访问令牌」创建后,设到环境变量里)。")
    base = os.environ.get("TEAMPLAT_URL", DEFAULT_URL).rstrip("/") + API_PREFIX
    return base, token


def _client(base: str, token: str) -> httpx.Client:
    return httpx.Client(
        base_url=base,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
        # local tooling talks to an internal host — never route through a proxy
        trust_env=False,
    )


def list_projects() -> list[dict]:
    base, token = _config()
    with _client(base, token) as c:
        r = c.get("/projects")
        if r.status_code == 401:
            raise ClientError("令牌无效或已过期。")
        r.raise_for_status()
        return r.json()


def resolve_project_id(name: str) -> str | None:
    """Best-effort name → id. Exact (case-insensitive) wins, else unique substring."""
    if not name:
        return None
    projects = list_projects()
    low = name.strip().lower()
    exact = [p for p in projects if p["name"].lower() == low]
    if exact:
        return exact[0]["id"]
    subs = [p for p in projects if low in p["name"].lower()]
    if len(subs) == 1:
        return subs[0]["id"]
    if len(subs) > 1:
        names = "、".join(p["name"] for p in subs)
        raise ClientError(f"项目名「{name}」匹配到多个:{names}。请用更精确的名称。")
    raise ClientError(f"找不到名为「{name}」的项目。")


def contribute(
    summary: str, project: str | None = None, kind: str = "work", client_id: str | None = None, **extra
) -> dict:
    """Push one work summary. `project` is a name (resolved to id) or None.

    Extra kwargs (repo, branch, sha, files_changed, insertions, deletions,
    diff_summary, source_agent, workspace_id, local_run_id, confidence,
    visibility) are forwarded to the API if non-None."""
    if not summary or not summary.strip():
        raise ClientError("summary 不能为空。")
    base, token = _config()
    project_id = resolve_project_id(project) if project else None
    payload: dict = {"summary": summary.strip(), "kind": kind}
    if project_id:
        payload["project_id"] = project_id
    if client_id:
        payload["client_id"] = client_id
    for k, v in extra.items():
        if v is not None:
            payload[k] = v
    with _client(base, token) as c:
        r = c.post("/me/contributions", json=payload)
        if r.status_code == 401:
            raise ClientError("令牌无效或已过期。")
        r.raise_for_status()
        return r.json()


def list_contributions(
    project: str | None = None, kind: str | None = None, since: str | None = None, limit: int = 50
) -> list[dict]:
    """Fetch the caller's own contribution history."""
    base, token = _config()
    params: dict = {"limit": limit}
    if project:
        pid = resolve_project_id(project)
        if pid:
            params["project_id"] = pid
    if kind:
        params["kind"] = kind
    if since:
        params["since"] = since
    with _client(base, token) as c:
        r = c.get("/me/contributions", params=params)
        if r.status_code == 401:
            raise ClientError("令牌无效或已过期。")
        r.raise_for_status()
        return r.json().get("items", [])
