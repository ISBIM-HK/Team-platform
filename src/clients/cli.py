"""teamplat CLI — push work to the platform from any shell.

export TEAMPLAT_URL=https://teamplat.internal   # 默认 http://localhost:3137
export TEAMPLAT_TOKEN=pat_xxx
teamplat contribute "用 Claude Code 写完了登录回调" --project "Tender AI"
teamplat projects
teamplat contributions --kind commit
"""

from __future__ import annotations

import typer

from src.clients.core import ClientError, contribute, list_contributions, list_projects

app = typer.Typer(add_completion=False, help="把本地 AI 工作投送到团队平台。")


@app.command("contribute")
def contribute_cmd(
    summary: str = typer.Argument(..., help="一句话说明你做了什么"),
    project: str | None = typer.Option(None, "--project", "-p", help="项目名(可省略)"),
    kind: str = typer.Option("work", "--kind", "-k", help="work | commit | note | review | deploy"),
    repo: str | None = typer.Option(None, "--repo", help="仓库名"),
    branch: str | None = typer.Option(None, "--branch", help="分支名"),
    sha: str | None = typer.Option(None, "--sha", help="commit SHA"),
    files: int | None = typer.Option(None, "--files", help="改动文件数"),
    insertions: int | None = typer.Option(None, "--insertions", help="新增行数"),
    deletions: int | None = typer.Option(None, "--deletions", help="删除行数"),
    visibility: str = typer.Option("project", "--visibility", "-v", help="self | project"),
    source: str | None = typer.Option(None, "--source", help="来源 agent 标识"),
    workspace: str | None = typer.Option(None, "--workspace", help="本地工作区标识"),
):
    """投送一条工作进展。"""
    try:
        res = contribute(
            summary,
            project=project,
            kind=kind,
            repo=repo,
            branch=branch,
            sha=sha,
            files_changed=files,
            insertions=insertions,
            deletions=deletions,
            visibility=visibility,
            source_agent=source,
            workspace_id=workspace,
        )
    except ClientError as e:
        typer.secho(str(e), fg=typer.colors.RED, err=True)
        raise typer.Exit(1)
    if res.get("deduped"):
        typer.secho(f"已存在(去重),event={res['event_id']}", fg=typer.colors.YELLOW)
    else:
        typer.secho(f"已投送 ✓ event={res['event_id']}", fg=typer.colors.GREEN)


@app.command("projects")
def projects_cmd():
    """列出你能看到的项目。"""
    try:
        projects = list_projects()
    except ClientError as e:
        typer.secho(str(e), fg=typer.colors.RED, err=True)
        raise typer.Exit(1)
    if not projects:
        typer.echo("(没有项目)")
        return
    for p in projects:
        pct = round(p.get("completion", 0) * 100)
        typer.echo(f"  {p['name']}  ·  {pct}%  ·  {p.get('done_count', 0)}/{p.get('task_count', 0)}")


@app.command("contributions")
def contributions_cmd(
    project: str | None = typer.Option(None, "--project", "-p", help="按项目过滤"),
    kind: str | None = typer.Option(None, "--kind", "-k", help="按类型过滤"),
    since: str | None = typer.Option(None, "--since", help="起始日期 (YYYY-MM-DD)"),
):
    """列出我的工作投送历史。"""
    try:
        items = list_contributions(project=project, kind=kind, since=since)
    except ClientError as e:
        typer.secho(str(e), fg=typer.colors.RED, err=True)
        raise typer.Exit(1)
    if not items:
        typer.echo("(暂无投送记录)")
        return
    for i in items:
        proj = f" [{i.get('project_name', '?')}]" if i.get("project_name") else ""
        typer.echo(f"  {i['occurred_at'][:16]}{proj}  {i['kind']}  {i['summary']}")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
