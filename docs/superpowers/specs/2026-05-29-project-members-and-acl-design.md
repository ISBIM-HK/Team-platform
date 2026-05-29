# 项目内成员管理 + 项目级 ACL — 设计文档

| 字段 | 值 |
|---|---|
| 日期 | 2026-05-29 |
| 状态 | 待用户复审 |
| 范围 | 给项目引入成员(lead/member)+ **项目级 ACL**(按成员隔离可见性);分发改由 lead 触发;认领需成员;Inbox 改每用户;修"新建项目弹窗无法退出"。 |
| 关联 | **推翻 G.5"团队内全可见、不做项目级 ACL"**;原 §7.3/§9.3 砍掉的"项目级 ACL"本轮启用。解决全局 `is_pm` 从未被设、分发触发不了的卡点。 |

## 0. 背景与决策

现状:项目同租户全可见、无成员;全局 `is_pm` 在代码里从未被设过 → 分发(PM-only)触发不了。决策:

- 启用 **项目级 ACL**:只有项目成员能看见该项目(推翻 G.5"团队全可见")。
- 项目成员两级:**lead**(创建者默认)/ **member**。
- 分发由 **lead**(或全局 `is_pm` 超级权限)触发,候选 = 本项目成员。
- **认领前提**:是该任务所属项目的成员。
- **Inbox(未分类)改每用户一个**(租户共享与 ACL 冲突)。
- **任何登录用户可建项目** → 自动成为该项目 lead。
- 顺手修:新建项目弹窗加退出(ESC / ✕ / 取消 / 点遮罩)。

## 1. 数据模型

新表 `project_members`:`id / project_id (FK) / user_id (FK) / tenant_id / role('lead'|'member') / added_at`;唯一 `(project_id, user_id)`;索引 `project_id`、`user_id`。

## 2. 角色与权限

- 创建项目者 → 自动 **lead + member**。
- **lead**:加/移成员、改成员角色、AI 分发/指派、改/归档项目、生成 brief。
- **member**:看项目 + 看板/进度、认领、做自己/创建的任务(沿用 §6.2 task 级限制)。
- 全局 `is_pm`:租户超级权限,可在任意项目行使 lead 权限(保留,不强依赖)。

## 3. 项目级 ACL(可见性隔离)

非成员对项目"不存在"(404 over 403):

- `GET /projects` → 仅我是成员的项目。
- `GET /projects/{id}`、`/{id}/tasks`、`/{id}/share`、`POST /{id}/brief` → 非成员 404。
- `GET /tasks`(全局看板)→ 仅含**我成员项目**里的任务。
- `POST /tasks/{id}/claim` → 非该项目成员 404。
- 任务详情/更新:§6.2(owner/creator/PM)之上叠加"须为项目成员"。
- 实现思路 / 通知 / 助手 workspace:owner-only 不变。

## 4. 成员管理 API(lead 改;成员可读)

- `GET /projects/{id}/members` → `[{user_id, name, role, added_at}]`(成员可读)。
- `POST /projects/{id}/members {user_id, role?}`(lead;加成员,默认 member)。
- `PATCH /projects/{id}/members/{user_id} {role}`(lead;改角色,如提为 lead)。
- `DELETE /projects/{id}/members/{user_id}`(lead;移除;**不可移除最后一个 lead**)。
- 前端:项目工作区"成员"入口(列表 + 加/移 + 角色)。

## 5. 分发(lead 触发)

`POST /tasks/{id}/suggest-assignment`:从"仅全局 is_pm"改为 **该任务项目的 lead 或全局 is_pm** 可触发;候选成员 = **该项目成员**(非整租户)。采纳 → 改 owner + 通知(已实现)。

## 6. 认领需成员

`claim` 前校验当前用户是该任务项目成员;非成员 → 404(不泄露存在)。

## 7. Inbox(每用户)

原租户级 Inbox 与 ACL 冲突 → **每用户一个 Inbox**(name 仍"未分类",`created_by` = 该用户、成员 = 本人);手动/历史/无项目任务进创建者自己的 Inbox。`ensure_inbox` 改 per-user。

## 8. 项目创建

任何登录用户可 `POST /projects` → 自动成为该项目 lead + member(不限全局 PM)。

## 9. 新建项目弹窗退出(UX 修复)

新建项目 modal 加:ESC 关闭、右上角 ✕、点遮罩关闭、取消按钮。顺带核对其他 overlay(plan/task/assistant settings)是否同问题,统一加 ESC + 点遮罩关闭。

## 10. 迁移(关键 — 回填必须到位)

- 建 `project_members` 表。
- **回填**:现有每个项目 → `created_by` 设 lead+member;该项目所有任务的 `owner_user_id`(非空)并为 member。
- Inbox:回填时把现有租户级 Inbox 的全部租户成员加为其成员(过渡),新建逻辑用 per-user。
- **顺序**:建表 + 回填 + 上 ACL 过滤,**同一次发布完成**;ACL 一生效,未回填成员立刻看不到自己项目。

## 11. 测试

- members CRUD + lead-only(member 加成员 → 403)。
- ACL:非成员 GET 项目/tasks/share、POST brief → 404;`GET /projects` 只含我的;`GET /tasks` 只含我成员项目。
- 认领:非成员 404;成员可认领。
- 分发:lead 可、member 403;候选 = 项目成员。
- Inbox per-user:两用户各自"未分类"隔离。
- 不可移除最后一个 lead。

## 12. 范围

**做**:`project_members`、项目级 ACL、lead 分发、认领需成员、per-user Inbox、新建弹窗退出修复。

**不做**:细粒度自定义 RBAC(仅 lead/member 两级)、跨租户、对外公开分享链接、字段级权限。

## 13. 决策日志

| 决策 | 选择 | 理由 |
|---|---|---|
| 可见性 | 项目级 ACL(成员才可见) | 用户要真隔离;推翻 G.5 全可见 |
| 角色 | lead / member 两级 | 够用;不做自定义 RBAC(§9.3) |
| 分发权限 | lead 或全局 is_pm | 解"没人是 PM"卡点;权限按项目走 |
| 认领 | 须为项目成员 | 用户要求;配合 ACL |
| Inbox | 每用户一个 | 租户共享与 ACL 冲突 |
| 项目创建 | 任何人可建 → lead | 沿用现行为;创建者天然 lead |
