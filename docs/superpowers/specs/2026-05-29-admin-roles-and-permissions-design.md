# admin 层 + 角色权限 — 设计文档

| 字段 | 值 |
|---|---|
| 日期 | 2026-05-29 |
| 状态 | 待用户复审 |
| 范围 | 统一权限层级 **admin > pm > 项目 lead > member**;加 admin 管理层(设 pm/admin、管成员);bootstrap(首用户=admin);admin/pm 绕过项目 ACL。**全服务端 DB,不建文件系统 profiles**。 |
| 关联 | 用户提议的"Hermes profiles + admin"以**服务端 DB 方式**落地(否决文件系统 profiles:多用户服务端不适用,且违反"单助手/拒多 agent"与全服务端/多租户/B-ready 铁律)。建立在 member-ACL spec(`2026-05-29-project-members-and-acl-design.md`)与 assistant-workspace spec 之上。 |

## 0. 背景与决策

现状:`users.is_admin` / `is_pm` 字段早有但**从未被设过** → 没人是 admin/pm → 分发触发不了、无人能管角色。决策(全服务端 DB):

- "profile"(每人独立 workspace)= **用户账号(角色)+ 其 `assistant_workspace`(已有,私有)+ 其项目成员关系**。不建 `profiles/` 文件夹。
- 角色层级:**admin > pm(全局)> 项目 lead(每项目)> member**。
- **bootstrap**:回填把每租户**最早创建的用户**促升为 admin+pm(即把你当前这个号设为 admin);今后**新租户首个注册者** → admin+pm。
- **admin/pm 绕过项目 ACL**(可见/管理全部项目);普通 member 仍受 ACL。
- **隐私边界**:admin 只管角色/权限,**不能读他人私有 workspace(人格/记忆/画像)或 chat**(隐私铁律 §5 不变)。

## 1. 角色模型(无新表)

复用已有字段,不新增表:
- `users.is_admin`(bool)— 租户最高权限。
- `users.is_pm`(bool)— 全局 PM。
- `project_members.role`('lead'|'member')— 每项目(来自 member-ACL spec)。

层级与能力:

| 角色 | 范围 | 能力 |
|---|---|---|
| admin | 租户 | 设/撤他人 pm 与 admin;管任意项目成员(越过 lead);看团队花名册与角色;**绕过 ACL** 看/管全部项目 |
| pm | 租户 | 建项目;任意项目内 AI 分发(超级);**绕过 ACL** 看全部项目 |
| lead | 每项目 | 管本项目成员、本项目分发、改/归档项目 |
| member | 每项目 | 看/做本项目(受 ACL) |

## 2. Bootstrap(冷启动 + 现有数据促升)

- **数据迁移(回填)**:每租户按 `created_at` 取**最早的 user** → 置 `is_admin=True, is_pm=True`(把你当前账号设为 admin+pm)。
- **注册逻辑**:`POST /auth/register` 时,若该租户**当前无任何用户**(即首个注册者)→ 新用户 `is_admin=True, is_pm=True`。
- 不可让租户**没有 admin**:`PATCH` 撤销时校验至少留 1 个 admin。

## 3. admin API(admin-only)

- `GET /admin/users` → 租户成员列表 + 角色(`id, display_name, email, is_admin, is_pm`)。
- `PATCH /admin/users/{user_id}` `{is_pm?, is_admin?}` → 设角色(admin-only;不可撤销最后一个 admin;非 admin → 403)。
- 越权(非 admin 调用)→ 403。

## 4. ACL 绕过(与 member-ACL spec 调和)

member-ACL spec 里所有"非成员 404"的项目/任务 ACL 检查,**对 admin/pm 放行**(admin/pm 视为全部项目的隐式成员):`GET /projects` 对 admin/pm 返回全部;`GET /projects/{id}`、/tasks、/share、分发、成员管理 对 admin/pm 不 404。普通 member 不变。

## 5. 隐私边界(不可越界)

- admin/pm **不能**读他人的 `assistant_workspaces`(persona/memory/profile)、`chat_*`、owner-only 的实现思路/通知。这些仍 owner-only(§5)。
- admin 管的是**组织结构与角色**,不是私有内容。`GET/PATCH /me/assistant`、`/me/notifications` 等仍只本人。

## 6. 前端

admin 见一个最小**"团队管理"面板**(花名册 + 每人 admin/pm 角色开关);非 admin 不显示入口。

## 7. 测试

- bootstrap:首个注册用户 is_admin+is_pm;后续注册者默认 False。
- 回填:每租户最早用户被促升。
- admin API:admin 可设角色;非 admin → 403;不可撤销最后一个 admin。
- ACL 绕过:admin/pm `GET /projects` 见全部、非成员项目不 404;普通 member 仍受限。
- 隐私:admin 读他人 `/me/assistant` 仍只能读自己的(无跨用户读取路径)。

## 8. 范围

**做**:bootstrap(回填 + 首注册者=admin)、admin 角色管理 API + 面板、admin/pm 绕过 ACL、隐私边界保持。

**不做**:**文件系统 profiles**、细粒度自定义 RBAC(仅 admin/pm/lead/member 四级)、跨租户、admin 读他人私有内容。

## 9. 决策日志

| 决策 | 选择 | 理由 |
|---|---|---|
| workspace 载体 | 服务端 DB(非文件系统 profiles) | 多用户服务端/多租户/B-ready;否决 Hermes 文件夹式 |
| 角色层级 | admin>pm>lead>member(复用已有字段) | 无新表;统一全局+项目两层 |
| bootstrap | 最早用户促升 admin+pm;首注册者=admin | 根治"没人是 admin/pm" |
| ACL 绕过 | admin/pm 看/管全部项目 | 管理需要;member 仍隔离 |
| 隐私 | admin 不读他人私有 workspace/chat | 隐私铁律 §5 不破 |
