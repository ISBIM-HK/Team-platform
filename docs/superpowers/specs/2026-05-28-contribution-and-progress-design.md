# 贡献投送与进度共享 — 设计文档

| 字段 | 值 |
|---|---|
| 日期 | 2026-05-28 |
| 状态 | 待用户复审 |
| 范围 | 让每人的本地 AI 工作经"同意"投送到平台,按项目汇总成进度共享 |
| 关联 | 建立在 projects 重构(`2026-05-28-projects-redesign-design.md` / HTML 附录 G)之上 |

## 0. 背景与目标

进度共享要有"每个人到底做了什么"的素材。设想:每人本地的 AI(Claude Code / Codex / Cursor 等)工作,**经本人同意**、且**确属项目相关**的部分,投送到平台,按项目自动汇总;结合任务的"阻塞/评审"信号,给出简洁的进度分享。

**核心隐私原则**:个人对话/AI 工作默认私有,PM 永不可见;只有**本人主动同意的项目相关内容**才进入共享层。

## 1. 架构与隐私模型(决策:全服务端 + 强隔离 + 同意门控)

- **全服务端**(不做本地优先):个人助手、数据都在服务端 Postgres。否决了"本地独立沙箱"方案——只要权限隔离做扎实,就能达到隐私预期,且不推翻现有架构。
- **强隔离**:`chat_*` 仅本人可见,PM/他人读不到(API 已强制,§5.4);通知同理。
- **同意门控**:本地 AI 工作不会自动全量上传;**投送 = 本人选择把哪条工作/摘要、归到哪个项目推上来**,这一动作本身即"同意"。原始对话不离开私有区。

## 2. 通用投送(source-agnostic,不绑定任何 agent)

服务端只提供**一个通用投送接口**,任何能发 HTTP 的客户端都能用:

- **PAT 认证**(设计 §5.5,未实现):本地工具无浏览器登录态,用个人令牌。`GET/POST/DELETE /me/tokens` 管理;`Authorization: Bearer pat_xxx`。
- **投送端点**:`POST /me/contributions`
  ```
  body: { summary, project_id?, kind?, client_id? }   # kind: 'work' | 'commit' | 'note'
  映射到 events_cache:
    event_type  = (kind=='commit' ? commit : manual_log)   # kind 决定 event_type(EventCache 无独立 kind 字段)
    payload     = { content: summary, kind }                # summary 存 payload.content
    source=agent, actor=本人, occurred_at=now, project_id=可空
    external_id = client_id(可选幂等键),默认 null
  ```
  **去重**:`external_id` 为 null 时 PG 唯一约束不去重——每次投送视为独立(预期:人工投送不天然幂等)。客户端(如重跑的 hook)若需去重,自行传稳定 `client_id` 作 `external_id`。
- **`events_cache` 加 `project_id`(nullable)**:工作痕迹可绑到项目(按项目汇进度的前提);未指定则留空(走"未分类"或仅个人可见)。
- **source 扩展**:`EventSource` 增 `agent`(泛指本地 AI 投送);保持 VARCHAR + 应用层枚举(不新增 PG 原生枚举)。

## 3. 跨 agent 客户端策略(押 MCP,不押 hook)

**hook 不是跨 agent 标准**——Claude Code(settings.json hooks)、Codex(config.toml + notify)、Cursor 各不相同,事件/schema 都不一样,按 hook 走 = 每 agent 一套适配。**真正跨 agent 一致的是 MCP**。

| 客户端 | 覆盖 | 优先级 |
|---|---|---|
| **MCP server**(`contribute_work(project, summary)` 工具) | 所有支持 MCP 的 agent(Claude Code/Cursor/Codex…)写一次通用 | **主力** |
| **小 CLI** `teamplat contribute --project X "..."` | 任何终端 agent 被叫去跑 / 人手动 | 次 |
| **Git**(已有 GitLab/GitHub 捕获) | 任何写代码的人,零 agent 要求 | 已有底座 |
| **手动**(助手 `log_manual_work` / 网页记一笔) | 没有任何本地 agent 的人 | 已有 |
| 单 agent hook(如 Claude Code Stop hook) | 仅特别在意某 agent 时 | 可选,非主力 |

MCP server 作为**独立组件**(不在 FastAPI 主进程内),调用平台的投送端点(带 PAT)。

## 4. 进度共享(share 页 AI 简报)

share 从"静态任务清单"升级为**聚合式进展简报**:
- **数据源**:本项目的任务(状态/负责人)+ 投送进来的工作痕迹(events_cache,按 project_id 过滤)+ 阻塞/评审信号。
- **AI 简报**:一键(按需,控成本)让 LLM 把上述聚合成一段同事可读的进展叙述(已完成 / 进行中 / 阻塞风险 / 下一步)。复用 decompose 的 PydanticAI 路子,记 llm_calls。
- **持久化(本轮补齐——原 spec 漏项)**:简报正文落库到 `reports` 表(kind=`project_brief`、`project_id`、`content`=简报 JSON、`model_used`、`user_id`=生成者),不只存 llm_calls 成本元数据。`POST /projects/{id}/brief` 生成时**追加一行**(不覆盖,留历史);`GET /projects/{id}/share` 带出**最新一条**(`brief` + `brief_generated_at`,未生成则 null)。**打开 share 不重算**——呼应 §8 决策"按需生成(非每次打开),控成本";否则每次重访都重算 Pro 简报,反而烧钱(撞 R2)。落 `reports` 与日/周报同款,不违反隐私铁律(铁律针对个人 chat 与 llm_calls,reports 本就是 AI 报告正文归宿)。
- **重排**:按负责人分组 + 阻塞高亮 + 完成度,而非平铺。
- **v1 可先只基于任务数据**出简报;投送链路就绪后再纳入 events。

## 5. 看板归档

"归档"后任务从 5 列消失,需有去处:看板顶部**"已归档 (N)"折叠区**,平时收起、可展开查看/恢复。不加第 6 列(避免拥挤)。

## 6. 数据 / API 变更汇总

- `events_cache` 加 `project_id UUID (nullable, FK projects)` + 索引;`EventSource` 加 `agent`
- **PAT**:新增 `personal_access_tokens` 表(id, user_id, name, token_hash, expires_at, created_at, last_used_at)+ `/me/tokens` CRUD;Bearer 鉴权与 cookie 并存
- `POST /me/contributions` 投送端点
- **简报持久化**:`reports` 加 `project_id UUID (nullable, FK projects)` + `ReportKind` 加 `project_brief`(均加性迁移;沿用 VARCHAR + 应用层枚举,不动 PG 原生 enum)
- `POST /projects/{id}/brief`:按需生成 → 追加一行 `reports`(kind=project_brief)→ 返回简报
- `GET /projects/{id}/share`:`ShareResponse` 增 `brief: ProgressBrief | null` + `brief_generated_at: datetime | null`(取该项目最新一条 project_brief);打开 share **不触发**生成
- 看板归档:前端折叠(后端 `archived` 状态已有,`GET /projects/{id}/tasks` 可加 `?include_archived=`)

## 7. 范围边界

**做**:PAT、通用投送端点、events.project_id、MCP server、小 CLI、share AI 简报(持久化到 reports)、归档折叠。

**不做(本轮)**:本地优先架构、per-agent hook 当主力、完整报告管线(日/周报 cron)、enum→TEXT 全量重构。

## 8. 决策日志(补充)

| 决策 | 选择 | 理由 |
|---|---|---|
| 隐私架构 | 全服务端 + 强隔离 + 同意门控 | 权限隔离即可达隐私预期,不推翻现有中心化架构 |
| 投送耦合 | 通用 source-agnostic 端点 | 不绑定任何 agent;agent 只是众多来源之一 |
| 跨 agent 接入 | MCP 为主,hook 仅可选 | hook 各家不通用;MCP 是跨 agent 标准 |
| 没 agent 的人 | Git + 手动兜底 | 不排除任何人 |
| 进度简报 | 按需生成(非每次打开) | 控 LLM 成本 |
| 简报持久化 | 落库到 `reports`(复用,非新表) | reports 本就是 AI 报告正文归宿(日/周报同款);不违反隐私铁律(该律针对个人 chat 与 llm_calls) |
| 简报多次生成 | 追加新行、share 取最新 | reports 天然按期/按日志存;免覆盖逻辑,自带历史与"上次生成于" |
