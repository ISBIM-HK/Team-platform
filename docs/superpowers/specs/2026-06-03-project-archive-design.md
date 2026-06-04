# 项目归档 + 删除（软删除两态）设计 — 2026-06-03

## 背景 / 目标

需要"移除一个项目"的能力。最初实现为 **hard-delete + 级联物理删除**（route `DELETE /projects/{id}` →
`ProjectRepository.delete_project` 手写按 FK 顺序 `DELETE` 掉 tasks / task_history / task_links /
events_cache / reports / project_members + pending ai_suggestions）。两份独立 review（reviewer/claude
与 worker/codex）一致认为**当前形态不应合入**——它与项目核心纪律冲突：

- `events_cache` 是 **append-only + TTL 90d**（CLAUDE.md 规则 #4），是未来 NATS JetStream 流的种子；
  硬删会把它从中间抹掉。
- `audit_log` 已建模（`src/models/audit_log.py`，append-only），整条删除却不留任何痕迹。
- `Project.status` 本就有 `active | archived` 生命周期（`src/models/project.py:24`）——软删除的基础设施已存在。
- 破坏性、不可逆、跨表的数据生命周期决策，却**没有走 spec 流程**（dev-stub 有 spec，delete 没有）。

**本设计（2026-06-03 用户拍板的最终形态）：前端永不物理删除。** 用 `status` 表达两种"软移除"意图，物理清除
只作为后台手动操作存在：

| 态 | 含义 | 前端可见性 | 可恢复 | 物理删 |
|---|---|---|---|---|
| `active` | 正常 | 默认列表可见 | — | — |
| `archived` | 归档：用完先收起来 | 默认隐藏，**「已归档」视图可见** | ✅ UI 一键恢复 | 否 |
| `deleted` | 删除：不想要了 | **任何前端列表都不显示**（含已归档） | ❌ 无 UI 恢复 | 仅后台手动 |

物理清除（真正从库里抹掉）由用户点名、维护者在后台手动执行，**无任何 UI / API 入口**——这样既满足"误建空项目
要能真删"的诉求，又把不可逆操作挡在随手可点的范围之外。

## 数据模型

- **不加新字段**。复用 `Project.status`（VARCHAR(20)，app 层校验，零迁移），取值扩为
  `active | archived | deleted`。避免再引入独立 `deleted` 布尔造成"是否可见"双真相源。

## 非目标

- **不做前端可触发的物理删除**，也不做"非空项目级联物理 purge"的 UI/API。物理清除一律后台手动。
- 若将来要把物理清除产品化（admin compliance purge：tenant admin 权限 + 强确认 + audit tombstone +
  events/reports/suggestions 保留策略），归 **P5+ 或单独 spec**。本期不做。
- 不改 `Project` 表结构、不改任务/事件/报告自身的删除语义（软移除时它们全部原样保留）。

## 改动点

### 1. 列表过滤：默认只 active；已归档可选；deleted 永不出现
`GET /projects` 现在不过滤 status。改 repository（`list_by_tenant` / `list_for_member`，tenant 过滤不变）：
- 默认（`include_archived=False`）：仅 `status == 'active'`。
- `include_archived=True`：`status IN ('active', 'archived')`——供「已归档」视图。
- **`deleted` 在两种情况下都不返回**（前端任何列表都看不到 deleted 项目）。

### 2. 归档 / 恢复：复用 PATCH（已实现，保留）
`PATCH /projects/{id}` 处理 `active ↔ archived`：
- 校验 `req.status ∈ {active, archived}`；**传 `deleted` → 422**（"删除请用 DELETE"），不让 PATCH 设 deleted。
- 恢复（含从 deleted 手动恢复）= `PATCH status=active`，PATCH 只校验目标态，来源态不限，所以维护者可借此把
  deleted 项目拉回 active。

### 3. 删除：DELETE 映射为软删（status=deleted）
`DELETE /projects/{id}`（重新加回，但**只做软标记，绝不物理删**）：
1. `_get_accessible(need_lead=True)`（lead 或全局 pm/admin；非成员 404、member 非 lead 403）。
2. Inbox（per-user "未分类"）→ **400**（不可删，与归档守卫一致）。
3. 其余任意项目（空或非空都可）→ 置 `status='deleted'`，写 `audit_log(action="project.delete")`。
   - **软删不丢数据**，所以**不需要**"空/非空"判断、不需要 409、不删任何 task/event/report/member/suggestion。
4. 走 `_get_accessible` + 按主键 `update` 单行，无裸 SQL——tenant 由 `_get_accessible` 保证，天然合规则 #3。

### 4. Inbox 守卫（防同一 PATCH 绕过 + 同时挡归档与删除）
`update_project` / `delete` 都要挡 Inbox。`update_project` 在**改 `p.name` 之前**先快照：

```python
was_inbox = p.name == INBOX_NAME            # 先快照，再改任何字段
if was_inbox and req.status in ("archived",):   # PATCH 只可能设 archived
    raise HTTPException(status_code=400, detail="Inbox 不可归档")
```

`delete` 同理：`if p.name == INBOX_NAME: 400`（DELETE 不改 name，无绕过问题）。
否则 `PATCH {name:"别名", status:"archived"}` 会先改名再让守卫失效。（字符串比对弱点见"遗留问题"。）

### 5. audit_log（本项目首次使用 audit_log）
status 真正发生迁移时写一条；同值不写：
- → `archived`：`project.archive`（PATCH）
- → `active`：`project.restore`（PATCH，含从 archived 或 deleted 恢复）
- → `deleted`：`project.delete`（DELETE）
- `AuditLog(tenant_id, action, actor_id=current_user.id, target_type="project", target_id=p.id,
  detail={"name": p.name})`。确立"生命周期操作写 audit"的范式。

### 6. 已移除/已隐藏项目的 pending suggestions（定死）
不能对**非 active**（archived 或 deleted）的项目接受建议——否则往收起/删掉的项目里落任务、改 owner，制造幽灵活动：
- **数据保留**，不物理删 suggestion。
- **accept 硬守卫（正确性）**：`accept_suggestion` 的 `_resolve_project(ref)` 中，`ref.project_id` 解析到的
  现有项目 `status != 'active'` → **422**（"项目不可用，无法接受建议"），不落任务、不改 owner。`assign` 经
  `task.project_id` 命中非 active 项目同样 422。
- **list 隐藏（UX 级）**：`list_suggestions` 默认过滤掉 `target_ref.project_id` 指向**非 active** 项目的
  pending 建议（`target_ref->>'project_id'` join `projects.status`，保留 `status='active'` 与无 project 引用的）。
- **状态保持 pending**：不主动改 `expired`；项目恢复成 active 后这些建议自动重新可接受。

### 7. 前端（app.js + index.html）
项目页（lead/pm/admin 可见）并列两个动作：
- **🗄 归档** → `PATCH status=archived`，文案"收起来、可在『已归档』恢复"。
- **🗑 删除** → `DELETE /projects/{id}`，**强确认**文案："删除后从所有列表隐藏（含已归档），需维护者后台手动彻底
  清除，普通操作无法恢复。" 任意非 Inbox 项目可删（不再按 task_count 显隐）。
- **「已归档」视图**：列 `?include_archived=true` 里 `status==='archived'` 的项目 + 每个的"恢复"按钮
  （`PATCH status=active`）。`deleted` 项目不出现在此视图，也不出现在任何列表。

### 8. 撤回原 hard-delete 残留
- `ProjectRepository.delete_project`（手写级联）+ `text` import：删除（已撤）。
- `tests/integration/test_projects_delete.py`：删除，由 `test_projects_archive.py` 取代。
- `docs/specs/team-platform-design.html`：硬删描述改为本设计语义（归档可恢复、删除软隐藏、物理清除后台手动）。

## 物理清除（后台手动，无 UI/API）

不在本期实现任何自动/接口化的物理删除。当用户点名要彻底清掉某个 `deleted` 项目时，由维护者在后台执行，并遵守：
- 删除前确认该项目确为 `status='deleted'`；
- 若非空（仍挂 tasks/events/reports），需明确知悉将一并物理删除这些 append-only 数据（这正是被推迟到 P5+ 的
  顾虑所在）——空项目则无此风险；
- 物理删后补写一条 `audit_log(action="project.purge")` 作为 tombstone。
- 将来若要产品化，按"非目标"里的 admin compliance purge spec 另立。

## 测试（`tests/integration/test_projects_archive.py`）

1. 归档后 `GET /projects` 默认**不含**；`?include_archived=true` 含。
2. 归档后数据仍可读：`GET /projects/{id}`、`/tasks`、`/share`（成员视角），tasks/history/events 未删。
3. 归档恢复：`PATCH status=active` 后回到默认列表。
4. Inbox 归档 → 400；`PATCH {name:"别名", status:"archived"}` 作用于 Inbox 仍 → 400（守卫先快照 name）。
5. 非成员 → 404；member 非 lead → 403（归档与删除都验，沿用 `_get_accessible(need_lead=True)`）。
6. audit：归档/删除/恢复各写一条正确 action（archive/delete/restore），同值 PATCH 不写。
7. **PATCH 设 deleted → 422**（删除必须走 DELETE）。
8. **删除（软）**：`DELETE` 任意项目（含**有 task 的非空项目**）→ 成功；该项目从默认列表**和** `include_archived`
   列表都消失；写一条 `project.delete` audit；**其 task/数据仍在库里**（软删不物理删，证明走的是状态而非级联）。
9. **删除后不可接受其建议**：accept 指向 deleted 项目的 decompose/assign → 422，无任务落库 / owner 不变；
   `list_suggestions(status=pending)` 默认不含该建议。
10. **归档项目的建议**同样 422 + 默认隐藏；项目恢复 active 后该建议可正常 accept（覆盖 archived 与 deleted 两路）。
11. **手动恢复 deleted**：`PATCH status=active` 作用于 deleted 项目 → 回到默认列表（维护者恢复路径）。

## 遗留 / 已知问题（不在本 spec 修，记录待办）

- Inbox 守卫用 `p.name == INBOX_NAME` 字符串比对：他项目命名为"未分类"会被误保护，inbox 改名后失保护。
  更稳：给 Project 加显式 `is_inbox` 标记位。
- `TaskHistory` / `TaskLink` 缺 `tenant_id`（`src/models/task.py:35,47`），违反规则 #3；本期不碰。
  将来做物理 purge 需 join 回 tasks 才能 tenant 过滤，建议先补列（add-column → backfill，非破坏性）。
- 物理清除的产品化（admin compliance purge：权限、强确认、tombstone、保留策略）待 P5+ 专门 spec。

## 改动面汇总

- `src/repositories/project_repo.py` — `list_by_tenant` / `list_for_member` 三态过滤（默认 active；
  include_archived → active+archived；deleted 永不返回）。**移除上一轮加的 `is_empty` / `delete_empty`**
  （软删不再需要物理删与空判定）。
- `src/api/routes/projects.py` — `list_projects` 加 `include_archived`；`update_project` 处理 active↔archived
  （拒 deleted=422）+ Inbox 守卫（先快照 name）+ audit；`DELETE /projects/{id}` 改为**软删**（置 deleted +
  Inbox 400 + audit project.delete，**去掉空/非空 409**）。
- `src/api/routes/suggestions.py` — accept 对**非 active** 项目 422；`list_suggestions` 默认隐藏指向非 active
  项目的 pending 建议。
- `frontend/app.js` + `frontend/index.html` — 项目页并列 🗄 归档 / 🗑 删除（任意非 Inbox 项目可删，不再按
  task_count 显隐，强确认文案）；「已归档」视图 + 恢复按钮；deleted 项目任何列表都不显示。
- `docs/specs/team-platform-design.html` — 同步"归档可恢复 / 删除软隐藏 / 物理清除后台手动"语义。
- `tests/integration/test_projects_archive.py` — 覆盖上述测试 1–11。
