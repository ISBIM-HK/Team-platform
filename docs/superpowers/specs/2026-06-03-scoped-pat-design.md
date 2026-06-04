# Scoped PAT（分权限个人令牌）设计 — 2026-06-03

> codex review 后修订版：scoped token 未标注路由**默认拒绝**；新 token 默认最小 scope；
> 本期**全部路由都标注** scope（不留未标注的洞）。

## 背景

team-platform 的 PAT 目前无权限范围限制——拿到 token 等于完全以用户身份操作。随着本地 agent 能力
扩展,**全权限 token 给长期运行的本地 agent 是不可接受的安全风险**。

## 目标

1. PAT 创建时选择 **scopes**,token 只能访问被授予的 API 子集。
2. **每个** API 路由声明需要的 scope,鉴权层自动检查。
3. 向后兼容:旧 token(无 scopes 列)+ 浏览器 cookie session = 全权限。
4. **scoped token(非 `*`)访问未标注路由 → 403**。这是最重要的安全原则。

## 安全模型

| 调用者类型 | 未标注路由 | 标注了 scope 的路由 |
|---|---|---|
| 浏览器 cookie session | ✅ 全通 | ✅ 全通 |
| PAT `scopes=["*"]` | ✅ 全通 | ✅ 全通 |
| scoped PAT `scopes=[具体值]` | **❌ 403** | 只通过匹配的 scope |

**因此本期必须标注全部路由**——不留"未标注"的洞。

## Scope 定义

`resource:action` 格式:

| scope | 覆盖的路由 |
|---|---|
| `contributions:write` | `POST /me/contributions` |
| `contributions:read` | `GET /me/contributions` |
| `projects:read` | `GET /projects`, `GET /projects/{id}`, `.../tasks`, `.../share`, `.../members` |
| `projects:write` | `POST /projects`, `PATCH /projects/{id}`, `DELETE /projects/{id}`, member CRUD |
| `tasks:read` | `GET /tasks` |
| `tasks:write` | `POST /tasks`, `PATCH /tasks/{id}`, `POST .../claim`, `POST .../impl-hint`, `POST .../suggest-assignment` |
| `suggestions:read` | `GET /suggestions` |
| `suggestions:write` | `POST /suggestions/{id}/accept`, `.../reject` |
| `notifications:read` | `GET /me/notifications*` |
| `notifications:write` | `POST /me/notifications/{id}/read` |
| `assistant:read` | `GET /me/assistant`, `GET /me/assistant/skills` |
| `assistant:write` | `PATCH /me/assistant`, `POST/PATCH/DELETE /me/assistant/skills/*` |
| `chat:read` | `GET /chat/sessions` |
| `chat:write` | `POST /chat/sessions`, WS `/ws/chat/*` |
| `tokens:manage` | `GET/POST/DELETE /me/tokens` |
| `admin` | `GET/PATCH /admin/*` |
| `users:read` | `GET /users` |
| `profile:read` | `GET /auth/me` |
| `integrations:read` | `GET /integrations` |
| `integrations:write` | `POST /integrations/gitlab`, `POST /integrations/sync` |
| `decompose` | `POST /decompose` |
| `brief` | `POST /projects/{id}/brief` |
| `pm` | `GET /pm/*`, `POST /pm/*` |
| `events:read` | `GET /events` |
| `events:write` | `POST /events/manual` |
| `*` | 全权限(旧 token 过渡 + 浏览器 session) |

**本地 agent 推荐最小 scope**: `contributions:write`, `contributions:read`, `projects:read`

## 数据模型

### personal_access_tokens 新增列(Alembic migration,add-column,非破坏性)

```python
class PersonalAccessToken(TimestampMixin, table=True):
    # ... 已有字段 ...
    scopes: list[str] = Field(
        default_factory=lambda: ["*"],
        sa_column=Column(ARRAY(String), nullable=False, server_default="{*}"),
    )
    agent_name: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)
```

Migration 默认值 `{"*"}`:旧 token 自动获得全权限,零破坏。

## 鉴权层

### deps.py

PAT 路径解析后挂 scopes:
```python
request.state.token_scopes = pat.scopes      # PAT
request.state.token_scopes = ["*"]            # cookie session
```

### scope 检查依赖

```python
VALID_SCOPES = {
    "contributions:write", "contributions:read", "projects:read", "projects:write",
    "tasks:read", "tasks:write", "suggestions:read", "suggestions:write",
    "notifications:read", "notifications:write", "assistant:read", "assistant:write",
    "chat:read", "chat:write", "tokens:manage", "admin", "users:read", "profile:read",
    "integrations:read", "integrations:write", "decompose", "brief", "pm",
    "events:read", "events:write", "*",
}

def require_scope(*all_needed: str):
    """ALL listed scopes must be present."""
    async def _check(request: Request):
        scopes = getattr(request.state, "token_scopes", [])
        if "*" in scopes:
            return
        for s in all_needed:
            if s not in scopes:
                raise HTTPException(status_code=403, detail=f"Token lacks scope: {s}")
    return _check

def require_any_scope(*any_of: str):
    """At least ONE of the listed scopes must be present."""
    async def _check(request: Request):
        scopes = set(getattr(request.state, "token_scopes", []))
        if "*" in scopes:
            return
        if not scopes & set(any_of):
            raise HTTPException(status_code=403, detail=f"Token lacks any of: {', '.join(any_of)}")
    return _check
```

### 路由标注(全部)

每个路由加 `dependencies=[Depends(require_scope("xxx"))]`:

```python
# contributions
@router.post("/contributions", ..., dependencies=[Depends(require_scope("contributions:write"))])
@router.get("/contributions", ..., dependencies=[Depends(require_scope("contributions:read"))])

# projects — read routes 用 require_any_scope 让 write 也能读
@router.get("", ..., dependencies=[Depends(require_any_scope("projects:read", "projects:write"))])
@router.post("", ..., dependencies=[Depends(require_scope("projects:write"))])

# tokens — 必须标注,防 scoped token 升权
@router.post("", ..., dependencies=[Depends(require_scope("tokens:manage"))])
@router.get("", ..., dependencies=[Depends(require_scope("tokens:manage"))])
@router.delete("/{token_id}", ..., dependencies=[Depends(require_scope("tokens:manage"))])

# admin / chat / assistant — 标注防 scoped token 越权
# ... 同理
```

**额外安全规则**:`scopes=["*"]` 的 token 只能由**浏览器 session** 或**已有 `*` token** 创建。
scoped PAT 不能创建另一个 `*` token(防升权)→ `POST /me/tokens` 路由里校验:
如果请求里 `scopes` 含 `"*"` 且 `request.state.token_scopes` 不含 `"*"` → 403。

## API 变更

### POST /me/tokens

```python
class TokenCreate(BaseModel):
    name: str = Field(max_length=100)
    scopes: list[str] = Field(default=["contributions:write", "contributions:read", "projects:read"])
    agent_name: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=500)
```

校验:
- 每个 scope 必须在 `VALID_SCOPES` 里(否则 422)
- 空列表 → 422
- 含 `"*"` 且调用者非全权限 → 403(防升权)

默认值是**本地 agent 推荐最小集**,而非 `["*"]`。要创建全权限 token 必须**显式传 `["*"]`**。

### GET /me/tokens

```python
class TokenInfo(BaseModel):
    id: str
    name: str
    scopes: list[str]
    agent_name: str | None
    description: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
```

## 前端

token 管理页:
- 创建时: scope 多选 checkbox,默认勾选推荐最小集;`"*"` 作为"高级: 全权限"选项,带警告文案
- 列表: 展示 scope 标签 + agent_name + last_used_at

## 测试清单

1. 创建 scoped token(`["contributions:write","projects:read"]`)→ 201,返回含 scopes。
2. 用该 token `POST /me/contributions` → **200**(scope 匹配)。
3. 用该 token `GET /projects` → **200**(scope 匹配)。
4. 用该 token `PATCH /tasks/{id}` → **403**(缺 `tasks:write`)。
5. 用该 token `DELETE /projects/{id}` → **403**(缺 `projects:write`)。
6. 用该 token `GET /chat/sessions` → **403**(缺 `chat:read`)。
7. 用该 token `GET /me/assistant` → **403**(缺 `assistant:read`)。
8. 用该 token `GET /admin/users` → **403**(缺 `admin`)。
9. 用该 token `POST /me/tokens` → **403**(缺 `tokens:manage`)。
10. 创建 `["*"]` token → 全权限,所有路由通过。
11. 旧 token(migration 后默认 `["*"]`)→ 行为不变。
12. 浏览器 cookie session → 全权限,不受 scope 影响。
13. 创建 token 传非法 scope → 422。
14. scoped token 尝试创建 `["*"]` token → **403**(防升权)。
15. scope 不足返回 **403**(非 401)。
16. `GET /me/tokens` 展示 scopes + agent_name。

## 改动面汇总

- `src/models/pat.py` — 加 `scopes`(ARRAY)、`agent_name`、`description`
- `src/migrations/versions/xxx_scoped_pat.py` — add-column migration
- `src/api/deps.py` — `request.state.token_scopes` + `require_scope` + `require_any_scope` + `VALID_SCOPES`
- `src/api/routes/tokens.py` — 创建时选 scope + 校验 + 防升权 + 展示
- **全部路由文件**(`contributions/projects/tasks/suggestions/notifications/assistant/chat/admin/tokens/users/auth/integrations/decompose/pm/events`) — 标注 scope
- `frontend/app.js` — token 管理: scope 选择 + 展示
- `tests/integration/test_scoped_pat.py` — 覆盖 1–16

## P4 预留: 配对绑定(不实现)

网页生成一次性 pairing code → 本地 `teamplat login-agent` 输入 → 平台创建 scoped PAT → 用户确认。
模型上 `agent_name` 已够用,配对只是创建 scoped token 的另一种交互方式。
