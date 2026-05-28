"""teamplat MCP server — the cross-agent entry point for contributing work.

Any MCP-capable agent (Claude Code, Codex, Cursor, …) can register this and
call `contribute_work` / `list_projects`. Config via env on the member's machine:

    TEAMPLAT_URL    平台地址(默认 http://localhost:3137)
    TEAMPLAT_TOKEN  个人访问令牌(PAT)

Claude Code 注册示例(~/.claude/settings.json 的 mcpServers):
    "teamplat": { "command": "teamplat-mcp",
                  "env": { "TEAMPLAT_TOKEN": "pat_xxx" } }
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from src.clients.core import ClientError, contribute
from src.clients.core import list_projects as _list_projects

mcp = FastMCP("teamplat")


@mcp.tool()
def contribute_work(summary: str, project: str | None = None, kind: str = "work") -> str:
    """把你刚完成的一段工作投送到团队平台,让同事在共享页看到进展。

    summary: 一句话说明做了什么(必填)。
    project: 项目名,可省略;会按名称匹配到对应项目。
    kind:    work(默认)| commit | note。
    """
    try:
        res = contribute(summary, project=project, kind=kind)
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


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
