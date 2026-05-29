# 工作区 AI 协助 + 通知 — 设计文档

| 字段 | 值 |
|---|---|
| 日期 | 2026-05-29 |
| 状态 | 待用户复审 |
| 范围 | 三个工作区增强:① 新需求拆进现有项目的入口 ② 认领任务后自动出实现思路 ③ 站内通知收件箱 |
| 关联 | 建立在 projects 重构(附录 G)与现有 decompose/suggestions 之上;不引入多 agent 多进程(沿用单 PydanticAI 助手) |

## 0. 背景

三点都来自"项目工作区的 AI 协助/收件箱体验偏弱"的反馈。核心约束保持不变:**AI 改状态必走 ai_suggestions + 人确认**(铁律 §2);**实现思路/通知不改状态**,故不走 accept/reject;**隐私**:通知与思路均 owner-only;**成本**:自动 AI 调用走 Flash(cheap 档)且计入每人每日 token 预算。

## 1. 特性 A — 新需求拆进现有项目(两个入口)

后端 `POST /decompose` 已支持 `project_id`(传入则 accept 把父+子任务加进该项目,见 `decompose.py` / `suggestions.py:_resolve_project`)。**后端不改**,只加两个前端/助手入口。

- **A1 看板「+ 新需求」按钮**:项目工作区 board 标签头部加显眼按钮 → 目标输入弹窗 → `POST /decompose {goal, project_id: 当前项目}` → 复用现有确认弹窗 `openPlan`(eyebrow="补充拆解 · 待确认")。
- **A2 助手工具** `decompose_into_project(goal, project_id)`:用户在工作区对右侧助手说"把这个需求拆进当前项目",助手调该工具 → 内部复用 `decompose_goal` + 建 `SuggestionType.decompose` 建议(`target_ref.project_id` = 当前项目)→ 回复"已生成拆解建议,请在 AI 建议里确认"。
  - 助手需知道"当前项目":前端建立 chat 会话/发消息时带上 `currentProjectId`,注入 `AssistantDeps.current_project_id`;工具默认用它,缺失时助手追问是哪个项目。

**数据/接口**:无新增。仅前端按钮 + 1 个助手工具 + `AssistantDeps` 增 `current_project_id` 字段。

## 2. 特性 B — 认领即自动出实现思路

- **AI 纯函数** `suggest_impl_hint(task, record) -> str`(新增 `src/ai/impl_hint.py`):输入任务标题/描述/项目名,用 `llm_model_cheap`(DeepSeek v4 Flash)产**一条最基本**的实现思路(一两句,不展开);记 `llm_calls`。PydanticAI `output_type=str` 或简单 `ImplHint(BaseModel){hint: str}`。
- **数据模型**:`tasks` 加两列(加性迁移):
  - `impl_hint: str | None`(默认 null)
  - `impl_hint_updated_at: datetime | None`
- **触发(自动)**:claim 成功后,**前端自动**调新端点 `POST /tasks/{id}/impl-hint`;该端点生成思路 → 写 `impl_hint` + `impl_hint_updated_at` → 返回。这样 `POST /tasks/{id}/claim` 保持快、且生成可独立重试。
  - **仅叶子任务**(无子任务的小任务)生成,省成本且更贴合"小任务";父/史诗任务跳过。
  - **预算**:计入每人每日 token 预算;预算耗尽则跳过(端点返回 null hint,不报错)。
  - 幂等:已有 `impl_hint` 时默认不重生成(除非显式 `?regenerate=true`)。
- **展示**:**AI 方案标签页**列出我认领的(叶子)任务 + 其实现思路(任务详情也保留显示);均读持久化的 `impl_hint`(换页不丢)。
- **改写(走助手)**:助手加两个工具:
  - `get_task_impl_hint(task_id) -> str`
  - `update_task_impl_hint(task_id, hint) -> str`(校验任务属本租户、本人 owner;写 `impl_hint` + 时间戳)
  - 用户与助手讨论后,助手改写存储的那条思路。
- **合规**:思路只是参考、不改 kanban/任务状态 → 不走 accept/reject(符合铁律 §2);存任务字段、非 chat_messages/llm_calls → 不违反隐私铁律 §5;owner-only(仅本人 owner 的任务能取/改思路)。

## 3. 特性 C — 站内通知 + 收件箱(与 AI 建议分开)

- **触发**:在 **claim** 与 **分配采纳**(accept `SuggestionType.assign`)时,给**获得任务归属的本人**建一条 `Notification`。
  - claim → kind=`task_claimed`,recipient = 认领者(自己)。
  - assign accept → kind=`task_assigned`,recipient = 被分配者(`suggestion.target_user_id`)。
- **枚举**:`NotificationKind` 加 `task_assigned`、`task_claimed`(加性,VARCHAR + 应用层枚举)。
- **API**(新增 notifications 路由):
  - `GET /me/notifications?unread=&limit=&offset=` — 仅本人(`recipient_user_id == current_user.id`)。
  - `GET /me/notifications/unread-count` — 未读数(给收件箱角标)。
  - `POST /me/notifications/{id}/read` — 标记已读(写 `read_at`);非本人 404(不泄露存在,§8)。
- **接线**:claim handler(`tasks.py`)与 assign-accept 分支(`suggestions.py`)各建一条 `Notification`(title/body 用任务标题,`source_ref={task_id, project_id}`)。
- **前端**:工作区加**独立「通知」收件箱区块**(铃铛 + 未读角标 + 列表 + 标记已读),**与「AI 建议」(plan 标签的待确认建议列表)分开**,不合并。
- **渠道**:仅站内;`pushed_channels` 留空(飞书/钉钉外推 P3+)。
- **隐私**:owner-only,PM 也读不到别人的通知(铁律 §5)。

## 4. 横切关注点

- **迁移全加性**:`tasks.impl_hint`、`tasks.impl_hint_updated_at` 加可空列;`NotificationKind` 加两枚举值 → 无破坏迁移(§7.5)。
- **多租户**:`notifications` 已带 `tenant_id`;所有查询带租户过滤。
- **成本**:impl-hint 用 Flash + 一条短输出 + 仅叶子任务 + 已有则不重生成 + 每日预算约束。
- **B-ready**:AI 处理为纯函数(`suggest_impl_hint`);通知创建走 repository;助手工具沿用现有 `RunContext[AssistantDeps]` 范式。
- **OpenAPI**:`/tasks/{id}/impl-hint`、`/me/notifications*` 入 `openapi.yaml`,同 PR。

## 5. 测试

- 单元:`suggest_impl_hint` 仅叶子任务触发的判定;通知 recipient 解析(claim=自己 / assign=被分配者)。
- 集成:claim → 自动 impl-hint 端点 → `tasks.impl_hint` 落库且换 session 仍在;assign accept → `GET /me/notifications` 出现 `task_assigned`;他人 `GET /me/notifications` 看不到(owner-only)。
- AI eval:impl-hint 质量(一条、可执行、不啰嗦)可加一个 case 集(可选,后续)。

## 6. 范围边界

**做**:看板「+新需求」按钮、助手 `decompose_into_project`、`tasks.impl_hint`(+自动生成端点+助手读改工具)、`task_assigned`/`task_claimed` 通知 + `/me/notifications` 路由 + 收件箱区块。

**不做(本轮)**:外部推送(飞书/钉钉)、通知与 AI 建议合并、impl-hint 走 accept/reject、非叶子任务自动思路、多 agent/多工作区(单独议题,见 §7)。

## 7. 关联的后续议题(不在本 spec)

用户另提"参考 Hermes agent 的每 agent 独立工作区 + memory.md/user.md + skills/mcp 来扩展助手"——这是**更大的独立设计**,且需评估与本项目"已否决多 agent 多进程"(CLAUDE.md / 原 CrewAI 方案被拒)的关系。**另起 spec 单独 brainstorm**,不混入本轮。

## 8. 决策日志

| 决策 | 选择 | 理由 |
|---|---|---|
| 新需求入口 | 看板按钮 + 助手工具(两个) | 后端已支持,补可发现入口;助手入口契合 G.3"AI 走助手" |
| 实现思路触发 | 认领后自动(前端调独立端点) | 用户要"自动";独立端点让 claim 保持快、可重试 |
| 思路模型/篇幅 | Flash + 一条最基本 + 仅叶子 | 控成本(R2),贴合"小任务" |
| 思路存储 | `tasks.impl_hint` 持久化 | 换页不丢、助手可改;不重蹈 brief 临时化覆辙 |
| 思路是否确认 | 不走 accept/reject | 只参考、不改状态,不触铁律 §2 |
| 通知触发 | claim + 分配采纳,均通知本人 | 用户明确要求两处都通知自己 |
| 收件箱与建议 | 分开两个区块 | 用户明确要求不合并 |
| 通知渠道 | 仅站内 | 外推 飞书/钉钉 属 P3+ |
