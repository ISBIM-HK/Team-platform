# Contribution 增强 + 本地 Agent 对接设计 — 2026-06-03

> codex review 后修订版：砍 pm_summary、不扩 PG enum（零迁移）、加字段校验、加 workspace_id、
> 明确确认边界、archived/deleted 项目拒投送。

## 背景

team-platform 已有完整的 contribution 投送管线：
- `POST /me/contributions`（PAT auth）→ `events_cache`（source=agent, dedup via external_id）
- `teamplat` CLI（`contribute` / `projects` 命令）
- MCP server（`contribute_work` / `list_projects` 工具）
- AI brief 生成（`POST /projects/{id}/brief`）→ 持久化到 `reports` → share 页展示

这条"本地→网页"的管线**已跑通**。本 spec 做 **P2/P3 的增强**（低风险、高价值、已有代码基础）。
"网页→本地"反向通道属 **P4**，本期不做。

## 目标

1. **结构化 contribution payload**：携带代码提交元数据（repo/branch/sha/files/diff summary）、
   来源 agent、工作区 ID、置信度。
2. **用户级可见性控制**：`self`（仅自己）/ `project`（项目成员）两档。
3. **来源溯源**：`source_agent` / `local_run_id` / `workspace_id` 标记投送来源。
4. **CLI + MCP 同步升级**：新字段穿透到 CLI 参数和 MCP 工具。
5. **brief 上下文增强**：AI brief 生成时利用新结构字段。
6. **GET /me/contributions**：查自己的投送历史。

## 非目标

- **不做"网页→本地"反向通道**（P4）。
- **不扩 PG enum**（`EventSource` / `EventType` 是原生 PG enum,新增值需要 Alembic migration,
  违反"零迁移"原则）——新 kind 值（`deploy` 等）放在 `payload.kind` 里,`event_type` 映射到已有值
  （`manual_log`）;新来源标识放在 `payload.source_agent` 里,`source` 继续用 `agent`。
  P4 做 daemon 时再评估是否改 enum 或迁移为 TEXT。
- **不做 `pm_summary` 可见性档位**（需要所有读取面一致脱敏,复杂度高、本期无前端列表、性价比低）。
  先做 `self | project` 两档；PM 摘要属 P4/P5 隐私产品化。
- **不做前端 contribution 列表/详情页**。
- **不做 contribution 编辑/删除**（append-only 规则 #4）。
- **不做确认/编辑 UI**：本期的"确认"边界是——投送前的确认由**本地 agent / 用户在本地完成**
  （CLI 命令行交互、MCP tool 调用由用户/agent 主动发起）,平台不实现确认 UI。

## 数据模型变更

### events_cache.payload 扩展（JSONB,零迁移）

当前格式：
```json
{"content": "实现了登录功能", "kind": "work"}
```

扩展后格式（向后兼容,所有新字段可选）：
```json
{
  "content": "实现了 SSO dev-stub 本地仿真登录",
  "kind": "commit",

  "repo": "team-platform",
  "branch": "main",
  "sha": "fcee680",
  "files_changed": 5,
  "insertions": 131,
  "deletions": 7,
  "diff_summary": "sso.py: 新增 POST /dev-login; config.py: sso_dev_stub flag; ...",

  "source_agent": "claude-code",
  "workspace_id": "~/code/team-platform",
  "local_run_id": "session-abc123",
  "confidence": 0.9,

  "visibility": "project"
}
```

### 字段说明与校验

| 字段 | 类型 | 默认 | 校验 | 说明 |
|---|---|---|---|---|
| `content` | str | 必填 | max_length=2000 | 投送摘要（已有） |
| `kind` | str | `"work"` | `Literal["work","commit","note","review","deploy"]` | 工作类型 |
| `repo` | str? | null | max_length=200 | 仓库名 |
| `branch` | str? | null | max_length=200 | 分支名 |
| `sha` | str? | null | regex `^[0-9a-f]{7,40}$` | commit SHA |
| `files_changed` | int? | null | ge=0 | 改动文件数 |
| `insertions` | int? | null | ge=0 | 新增行数 |
| `deletions` | int? | null | ge=0 | 删除行数 |
| `diff_summary` | str? | null | max_length=4000 | 人可读的改动摘要 |
| `source_agent` | str? | null | max_length=100 | 投送来源 agent（`claude-code`/`cursor`/`hermes`/`cli`） |
| `workspace_id` | str? | null | max_length=500 | 本地工作区标识（用户可自选,如 repo root basename） |
| `local_run_id` | str? | null | max_length=200 | 本地会话/运行 ID,溯源 + P4 回传关联 |
| `confidence` | float? | null | ge=0, le=1 | 投送"有用度"自评 |
| `visibility` | str | `"project"` | `Literal["self","project"]` | 可见性（两档） |

### EventSource / EventType：不扩展

保持现有值不变。映射逻辑：
```python
_KIND_TO_EVENT_TYPE = {
    "commit": EventType.commit,
    "review": EventType.pr_reviewed,
}
# deploy / work / note → EventType.manual_log (fallback)
```
`source` 继续用 `EventSource.agent`。新的 kind 值和来源标识**只存 payload**,不进 enum。

### archived / deleted 项目拒投送

`POST /me/contributions` 若 `project_id` 指向 `status != 'active'` 的项目 → **422**
（"项目不可用,无法投送"）。避免给已归档/已删除的项目继续投进展。

## API 变更

### POST /me/contributions — 扩展请求体

```python
class ContributionIn(BaseModel):
    summary: str = Field(max_length=2000)
    project_id: uuid.UUID | None = None
    kind: Literal["work", "commit", "note", "review", "deploy"] = "work"
    client_id: str | None = Field(None, max_length=500)

    repo: str | None = Field(None, max_length=200)
    branch: str | None = Field(None, max_length=200)
    sha: str | None = Field(None, pattern=r"^[0-9a-f]{7,40}$")
    files_changed: int | None = Field(None, ge=0)
    insertions: int | None = Field(None, ge=0)
    deletions: int | None = Field(None, ge=0)
    diff_summary: str | None = Field(None, max_length=4000)
    source_agent: str | None = Field(None, max_length=100)
    workspace_id: str | None = Field(None, max_length=500)
    local_run_id: str | None = Field(None, max_length=200)
    confidence: float | None = Field(None, ge=0, le=1)
    visibility: Literal["self", "project"] = "project"
```

**向后兼容**：原来只传 `{summary}` 的调用不受影响。

路由改动：把新字段塞进 `payload` JSONB：
```python
payload = {"content": req.summary, "kind": req.kind}
for field in ("repo", "branch", "sha", "files_changed", "insertions", "deletions",
              "diff_summary", "source_agent", "workspace_id", "local_run_id",
              "confidence", "visibility"):
    val = getattr(req, field)
    if val is not None and val != "project":  # skip default visibility
        payload[field] = val
```
（`visibility` 默认 `"project"`,不存以减少 payload 体积；读取时 `payload.get("visibility", "project")`。）

新增校验：若 `project_id` 给定,查 Project 的 status,`!= 'active'` → 422。

### GET /me/contributions — 新增

```
GET /me/contributions?project_id=&kind=&since=2026-06-01&limit=50&offset=0
```

返回当前用户的 `events_cache` 中 `source = agent` 且 `actor_user_id = current_user.id` 的记录
（`self` 和 `project` 可见性的都返回——这是自己的端点,都看得到）。

响应：
```python
class ContributionListItem(BaseModel):
    event_id: str
    project_id: str | None
    project_name: str | None
    kind: str
    summary: str
    occurred_at: datetime
    payload: dict

class ContributionListResponse(BaseModel):
    items: list[ContributionListItem]
    total: int
```

## CLI 升级（src/clients/cli.py）

```bash
teamplat contribute "实现了 SSO dev-stub" \
  --project team-platform \
  --kind commit \
  --repo team-platform \
  --branch main \
  --sha fcee680 \
  --files 5 \
  --insertions 131 \
  --deletions 7 \
  --visibility project \
  --source claude-code \
  --workspace team-platform
```

所有新参数可选。`--files` = `files_changed` 短名,`--source` = `source_agent` 短名,
`--workspace` = `workspace_id` 短名。

新增命令：
```bash
teamplat contributions [--project NAME] [--kind KIND] [--since 2026-06-01]
```

## MCP server 升级（src/clients/mcp_server.py）

`contribute_work` 工具签名扩展（新参数全可选）：
```python
@mcp.tool()
def contribute_work(
    summary: str, project: str | None = None, kind: str = "work",
    repo: str | None = None, branch: str | None = None, sha: str | None = None,
    files_changed: int | None = None, insertions: int | None = None,
    deletions: int | None = None, diff_summary: str | None = None,
    visibility: str = "project", source_agent: str | None = None,
    workspace_id: str | None = None,
) -> str:
```

新增工具：
```python
@mcp.tool()
def my_contributions(project: str | None = None, kind: str | None = None, limit: int = 20) -> str:
    """列出我最近的工作投送。"""
```

## Brief 上下文增强

`_build_brief_context`（projects.py）在构建"成员投送的工作痕迹"时：
- 有 `repo` + `sha` → `[commit fcee680] team-platform/main: 实现了 SSO dev-stub (5 files, +131/-7)`
- 有 `source_agent` → `(via claude-code)`
- 有 `confidence` → brief agent 可据此排序/筛选
- **`visibility=self` 的投送永不进入项目级 brief context**
- brief context 只使用**该项目内**的 events（已有 `project_id` 过滤）

## 测试清单

1. `POST /me/contributions` 带全部新字段 → 201,payload JSONB 含所有字段,字段校验生效
   （sha 非 hex → 422,files_changed 负数 → 422,visibility 非法值 → 422）。
2. 向后兼容：只传 `{summary}` → 仍 201,payload 仅 `content` + `kind`。
3. `visibility=self` 的投送：本人 `GET /me/contributions` 能看到；该投送**不进入**
   `POST /projects/{id}/brief` 的 context。
4. `visibility=project` 的投送：本人 + 项目成员可在 brief/share 中看到。
5. `GET /me/contributions` 分页、过滤（project_id / kind / since）。
6. 幂等：同 `client_id` 重复投送 → `deduped=true`。
7. `EventType` 映射：kind=commit→commit, kind=review→pr_reviewed, 其余→manual_log。
   **不新增 PG enum 值**。
8. brief context 利用新字段：有 repo+sha 的投送在 context 里包含 commit 元数据格式。
9. archived / deleted 项目投送 → 422。

## 改动面汇总

- `src/api/routes/contributions.py` — ContributionIn 扩展(含校验) + payload 构建 + 项目 status 校验 +
  GET /me/contributions
- `src/clients/cli.py` — contribute 新参数 + contributions 命令
- `src/clients/mcp_server.py` — contribute_work 签名扩展 + my_contributions 工具
- `src/clients/core.py` — contribute() 新字段穿透 + list_contributions()
- `src/api/routes/projects.py` — `_build_brief_context` 利用新 payload 字段 + visibility 过滤
- `tests/integration/test_contributions.py` — 新增/扩展测试覆盖 1–9
- **不改** `src/models/common.py`（不扩 enum）

零迁移,零破坏。

## P4 预留说明（不在本期实现,仅记录设计方向）

将来的"网页→本地"反向通道：
1. 本地安装 `teamplat-local-agent` daemon,用 PAT auth 主动向平台建立 WebSocket 连接。
2. 平台新增 `local_action_requests` 表,记录"网页助手提议的本地动作"。
3. 本地 daemon 收到 pending request → 用户确认 → 执行 → 选择性回传（复用
   `POST /me/contributions` + `payload.source_agent=local-agent`）。
4. 遵守"AI 不执行"规则 + 隐私底线。
5. P4 时评估是否扩 PG enum 或迁移 source/event_type 列为 TEXT。
