# Saved Views + Pages/Wiki + Cycles — 设计文档

> 2026-06-05 · Team Platform · 参考 Plane 开源项目  
> Rev 2: 合并 codex review 意见（6 项修改）

## 概述

三个功能按风险从低到高排序实施：Saved Views → Pages/Wiki → Cycles。共享同一设计语言（Slate+Gold 主题、6px 圆角、暖灰底）。

### 通用约定

- **主键**：应用层 `default_factory=new_uuid`（UUID v7），不依赖 Postgres `uuid_v7()` 函数
- **时间字段**：统一用 naive UTC `datetime`（与现有项目一致），不用 `TIMESTAMPTZ`
- **PAT scope**：新增 `views:read`, `views:write`, `pages:read`, `pages:write`, `cycles:read`, `cycles:write`

---

## 1. Saved Views（自定义视图）

### 1.1 目标

用户保存筛选/排序/分组条件，快速切换不同任务视角（如"我的逾期任务"、"未分配高优先级"）。

### 1.2 数据模型

```python
class SavedView(SQLModel, table=True):
    id: UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    project_id: UUID | None = Field(default=None, foreign_key="projects.id")
    owner_user_id: UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=120)
    visibility: str = Field(default="private")    # private | project
    resource_type: str = Field(default="tasks")
    config: dict = Field(sa_column=Column(JSONB, nullable=False))
    config_version: int = Field(default=1)
    position: int = Field(default=0)
    created_at: datetime
    updated_at: datetime
```

约束：`CHECK (visibility != 'project' OR project_id IS NOT NULL)`

**config 结构**（白名单字段，后端校验）：

```json
{
  "filters": {
    "status": ["todo", "blocked"],
    "owner_user_id": "me",
    "priority": [2, 3],
    "cycle_id": null,
    "due_before": "2026-06-10",
    "due_after": null,
    "overdue": true
  },
  "sort": [{"field": "created_at", "dir": "desc"}],
  "group_by": "status"
}
```

允许的 filter 字段：`status`, `owner_user_id`, `priority`, `parent_task_id`, `cycle_id`, `due_before`, `due_after`, `overdue`。  
允许的 sort 字段：`created_at`, `updated_at`, `priority`, `estimated_hours`, `title`。  
允许的 group_by：`status`, `owner_user_id`, `priority`。

动态值解析：`owner_user_id: "me"` 由后端替换为当前用户 ID；`overdue: true` 转为 `due_date < now() AND status NOT IN ('done', 'archived')`。

### 1.3 API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/me/views` | 我的所有视图 |
| POST | `/me/views` | 创建个人视图 |
| GET | `/projects/{pid}/views` | 项目共享视图（后期） |
| PATCH | `/views/{id}` | 更新视图（owner 或 lead+） |
| DELETE | `/views/{id}` | 删除视图（owner 或 lead+） |
| GET | `/views/{id}/tasks` | 按视图配置查询任务（验证 owner/membership，404） |

所有读取接口按 owner / project membership 做 404 over 403。

### 1.4 前端

看板上方加视图选择条：

```
[默认看板 ▾] [我的逾期] [高优先未分配] [+ 保存当前筛选]
```

点击视图名切换筛选，看板/列表实时更新。"保存当前筛选"弹出命名输入框。

### 1.5 MVP vs 后期

| MVP | 后期 |
|-----|------|
| 个人视图 CRUD | 项目共享视图（visibility=project，lead+ 可写） |
| 看板筛选 + 逾期过滤 | 列表视图模式 |
| 3 种 group_by | 嵌套分组（sub-group） |
| 手动排序 | 拖拽排序 position |
| — | filter drawer UI |

---

## 2. Pages/Wiki（项目文档）

### 2.1 目标

每个项目内创建 Markdown 页面，支持树状层级，用于存放技术规范、会议纪要、标准文档。

### 2.2 数据模型

```python
class Page(SQLModel, table=True):
    id: UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    project_id: UUID = Field(foreign_key="projects.id", index=True)
    parent_page_id: UUID | None = Field(default=None, foreign_key="pages.id")
    title: str = Field(max_length=255)
    content_md: str = Field(default="")
    status: str = Field(default="active")    # active | archived | deleted
    position: int = Field(default=0)         # 同级排序
    version: int = Field(default=1)
    created_by: UUID = Field(foreign_key="users.id")
    updated_by: UUID = Field(foreign_key="users.id")
    created_at: datetime
    updated_at: datetime
```

**与 ProjectWorkspace 的关系**：保持独立。ProjectWorkspace 是"AI 注入用的高信号项目上下文"（3 个固定字段），Pages 是"项目文档库"（无限页面）。后期可从 Pages 自动生成 ProjectWorkspace 摘要。Pages 内容不默认注入助手上下文（太长且有 prompt injection 风险）。

### 2.3 API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/projects/{pid}/pages` | 页面列表（树状，过滤 status!=deleted） |
| POST | `/projects/{pid}/pages` | 创建页面 |
| GET | `/projects/{pid}/pages/{id}` | 页面详情 |
| PATCH | `/projects/{pid}/pages/{id}` | 更新（带 version 乐观锁，冲突 409） |
| DELETE | `/projects/{pid}/pages/{id}` | 软删除 → status=deleted（需 lead+） |
| POST | `/projects/{pid}/pages/{id}/restore` | 恢复已删除页面（需 lead+） |

### 2.4 权限

- 项目成员：可读、可创建、可编辑
- 移动（改 parent_page_id）、删除、恢复：lead / PM / admin
- 非项目成员：404

### 2.5 校验规则

- `parent_page_id` 必须校验同 tenant + 同 project，否则拒绝
- 树移动前检测循环引用（遍历 parent 链，若出现自身则拒绝）
- PATCH 必须带 `version`，不匹配返回 409

### 2.6 前端

项目内新增 **文档** tab（在"成员"后面）：

- 左侧：页面树（可折叠，position 排序）
- 右侧：Markdown 编辑器（textarea + 预览切换）
- 新建页面按钮在树顶部
- 子页面通过页面详情内的"+ 子页面"创建
- 移动端：树列表和编辑器分步视图（非并排）

### 2.7 MVP vs 后期

| MVP | 后期 |
|-----|------|
| Markdown textarea 编辑 | 富文本编辑器（ProseMirror/TipTap） |
| 树状层级显示 + position 排序 | 拖拽排序树 |
| 乐观锁防冲突（409） | 实时协同编辑（OT/CRDT） |
| 三态软删除（active/archived/deleted） | 版本历史 + diff |
| 基础 escapeHtml 渲染 | AI 总结/重写页面 |

### 2.8 安全

- Markdown 渲染必须防 XSS（`escapeHtml` 或 DOMPurify）
- `parent_page_id` 同 tenant + 同 project 校验
- 树移动循环检测

---

## 3. Cycles 冲刺周期

### 3.1 目标

时间盒迭代管理。BIM 项目按阶段推进（方案→初设→施工图→竣工），每个 cycle 关联一组任务并跟踪进度。

### 3.2 数据模型

```python
class Cycle(SQLModel, table=True):
    id: UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    project_id: UUID = Field(foreign_key="projects.id", index=True)
    name: str = Field(max_length=120)
    description: str | None = None
    status: str = Field(default="planned")    # planned | active | completed | archived
    start_date: date
    end_date: date      # CHECK (end_date > start_date)
    created_by: UUID = Field(foreign_key="users.id")
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

class CycleTask(SQLModel, table=True):
    id: UUID = Field(default_factory=new_uuid, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    cycle_id: UUID = Field(foreign_key="cycles.id", index=True)
    task_id: UUID = Field(foreign_key="tasks.id", index=True)
    added_by: UUID = Field(foreign_key="users.id")
    added_at: datetime
    removed_at: datetime | None = None
    # UNIQUE(cycle_id, task_id)
```

### 3.3 产品规则

- **一个项目同时只允许一个 active cycle**（BIM 阶段线性推进）。service 层校验：`POST cycles` 设 status=active 时，检查同 project 无其他 active cycle。
- **一个任务同时只属于一个 planned/active cycle**。添加任务时 service 层校验：查 `cycle_tasks JOIN cycles WHERE status IN ('planned', 'active') AND removed_at IS NULL`，若已存在则拒绝（400）或提示先从旧 cycle 移除。
- **所有统计必须过滤 `removed_at IS NULL`**。
- task 与 cycle 必须属于同 project / 同 tenant。

### 3.4 API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/projects/{pid}/cycles` | 周期列表 |
| POST | `/projects/{pid}/cycles` | 创建周期（lead+） |
| GET | `/projects/{pid}/cycles/{cid}` | 周期详情 + 进度统计 |
| PATCH | `/projects/{pid}/cycles/{cid}` | 更新周期（lead+） |
| DELETE | `/projects/{pid}/cycles/{cid}` | 归档周期 → status=archived（lead+） |
| POST | `/projects/{pid}/cycles/{cid}/tasks` | 添加任务（lead+） |
| DELETE | `/projects/{pid}/cycles/{cid}/tasks/{tid}` | 移除任务（lead+） |
| POST | `/projects/{pid}/cycles/{cid}/close` | 关闭周期 → completed（lead+） |

### 3.5 关闭逻辑

关闭 cycle 时：
1. 标记 `status = completed`，设置 `closed_at`
2. 返回 `{ completed_count, incomplete_tasks: [...] }`
3. **不自动滚入下一个 cycle**——前端展示未完成列表，lead 手动选择转入

### 3.6 前端

项目内新增 **周期** tab（在"文档"后面）：

- 周期列表：卡片式，活跃周期金色左侧线
- 周期详情：左侧任务列表（可加/移任务），右侧进度统计
- 看板加 cycle 筛选器（下拉选择当前活跃 cycle）
- 关闭 cycle 弹出未完成任务确认 modal
- 移动端：列表/详情分步视图

### 3.7 进度统计（MVP）

实时计算，不做快照：

```json
{
  "total": 15,
  "completed": 8,
  "in_progress": 4,
  "blocked": 1,
  "todo": 2,
  "completion_pct": 53
}
```

### 3.8 MVP vs 后期

| MVP | 后期 |
|-----|------|
| Cycle CRUD + 归档 + 任务关联 | 自动滚入建议（AI） |
| 实时进度统计 | 每日快照 + 燃尽图 |
| 看板 cycle 筛选 | 甘特图时间线视图 |
| 手动关闭 | 到期自动提醒 |
| lead+ 创建/管理 | Velocity 趋势分析 |
| 一项目一活跃 cycle | 多 cycle 并行（高级模式） |

---

## 通知集成

三个功能都需要扩展 NotificationService：

| 触发 | 通知内容 | 降噪 |
|------|---------|------|
| 页面创建/更新 | "XX 更新了页面「技术规范 v2」" | 编辑合并：5 分钟内同用户同页面只推一次 |
| 任务加入 cycle | "你的任务「风险分析引擎」已加入周期「施工图阶段」" | 仅通知任务 owner |
| Cycle 即将到期 | "周期「初设阶段」将在 3 天后结束，还有 5 个未完成任务" | 后期实现 |

---

## AI 集成点（后期）

- Pages：AI 总结页面、生成会议纪要模板
- Cycles：AI 建议哪些任务应加入当前 cycle、预估是否能按时完成
- Views：AI 推荐视图（"你可能想看看阻塞超过 3 天的任务"）

所有 AI 输出走 `ai_suggestions`，不直接修改数据。注意现有 `SuggestionType` 枚举需要扩展以支持新类型。

---

## PAT scope 扩展

新增以下 scope：

| scope | 说明 |
|-------|------|
| `views:read` | 查看视图 |
| `views:write` | 管理视图 |
| `pages:read` | 查看文档 |
| `pages:write` | 编辑文档 |
| `cycles:read` | 查看周期 |
| `cycles:write` | 管理周期 |

---

## 迁移计划

```
alembic revision --autogenerate -m "add_saved_views"
alembic revision --autogenerate -m "add_pages"
alembic revision --autogenerate -m "add_cycles_and_cycle_tasks"
```

三次独立迁移，按实施顺序逐个提交。所有新表主键使用应用层 `new_uuid()`，时间字段用 naive UTC `datetime`，与现有项目一致。
