"""Onyx MCP server — the cross-agent entry point for contributing work.

Any MCP-capable agent (Claude Code, Codex, Cursor, …) can register this and
call `contribute_work` / `list_projects` / `my_contributions`.

    ONYX_URL    平台地址(默认 http://localhost:3137)
    ONYX_TOKEN  个人访问令牌(PAT)
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from src.clients.core import ClientError, contribute
from src.clients.core import list_contributions as _list_contributions
from src.clients.core import list_projects as _list_projects

mcp = FastMCP("onyx")


@mcp.tool()
def contribute_work(
    summary: str,
    project: str | None = None,
    kind: str = "work",
    repo: str | None = None,
    branch: str | None = None,
    sha: str | None = None,
    files_changed: int | None = None,
    insertions: int | None = None,
    deletions: int | None = None,
    diff_summary: str | None = None,
    visibility: str = "project",
    source_agent: str | None = None,
    workspace_id: str | None = None,
) -> str:
    """把你刚完成的一段工作投送到团队平台,让同事在共享页看到进展。

    summary: 一句话说明做了什么(必填)。
    project: 项目名,可省略;会按名称匹配到对应项目。
    kind:    work(默认)| commit | note | review | deploy。
    repo/branch/sha/files_changed/insertions/deletions: 代码提交元数据(可选)。
    diff_summary: 人可读的改动摘要(可选)。
    visibility: self(仅自己)| project(项目成员可见,默认)。
    source_agent: 来源 agent 标识(如 claude-code / cursor)。
    workspace_id: 本地工作区标识。
    """
    try:
        res = contribute(
            summary,
            project=project,
            kind=kind,
            repo=repo,
            branch=branch,
            sha=sha,
            files_changed=files_changed,
            insertions=insertions,
            deletions=deletions,
            diff_summary=diff_summary,
            visibility=visibility,
            source_agent=source_agent,
            workspace_id=workspace_id,
        )
    except ClientError as e:
        return f"投送失败:{e}"
    if res.get("deduped"):
        return f"这条已经投送过了(去重),event={res['event_id']}。"
    where = f"到项目「{project}」" if project else ""
    return f"已投送{where} ✓,event={res['event_id']}。"


@mcp.tool()
def list_projects() -> str:
    """列出你能看到的项目及完成度,方便确认 contribute_work 的 project 名称。"""
    try:
        projects = _list_projects()
    except ClientError as e:
        return f"获取失败:{e}"
    if not projects:
        return "(暂无项目)"
    lines = [
        f"- {p['name']}(完成度 {round(p.get('completion', 0) * 100)}%,"
        f"{p.get('done_count', 0)}/{p.get('task_count', 0)})"
        for p in projects
    ]
    return "\n".join(lines)


@mcp.tool()
def my_contributions(project: str | None = None, kind: str | None = None, limit: int = 20) -> str:
    """列出我最近的工作投送。"""
    try:
        items = _list_contributions(project=project, kind=kind, limit=limit)
    except ClientError as e:
        return f"获取失败:{e}"
    if not items:
        return "(暂无投送记录)"
    lines = []
    for i in items:
        proj = f" [{i.get('project_name', '?')}]" if i.get("project_name") else ""
        lines.append(f"- {i['occurred_at'][:16]}{proj} {i['kind']}: {i['summary']}")
    return "\n".join(lines)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
