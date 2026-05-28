"""teamplat CLI — push work to the platform from any shell.

    export TEAMPLAT_URL=https://teamplat.internal   # 默认 http://localhost:3137
    export TEAMPLAT_TOKEN=pat_xxx
    teamplat contribute "用 Claude Code 写完了登录回调" --project "Tender AI"
    teamplat projects
"""

from __future__ import annotations

import typer

from src.clients.core import ClientError, contribute, list_projects

app = typer.Typer(add_completion=False, help="把本地 AI 工作投送到团队平台。")


@app.command("contribute")
def contribute_cmd(
    summary: str = typer.Argument(..., help="一句话说明你做了什么"),
    project: str | None = typer.Option(None, "--project", "-p", help="项目名(可省略)"),
    kind: str = typer.Option("work", "--kind", "-k", help="work | commit | note"),
):
    """投送一条工作进展。"""
    try:
        res = contribute(summary, project=project, kind=kind)
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


def main() -> None:
    app()


if __name__ == "__main__":
    main()
