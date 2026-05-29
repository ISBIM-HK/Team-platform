# 助手持久 workspace — 设计文档

| 字段 | 值 |
|---|---|
| 日期 | 2026-05-29 |
| 状态 | 待用户复审 |
| 范围 | 给单个个人 AI 助手一个 Hermes 式持久工作区(容器):人格(SOUL) + 记忆(MEMORY) + 用户画像(USER) + 可插拔 **skills(指令包)** + 可配 **MCP(仅远程 + 凭据加密)**。全服务端 Postgres、owner-only。**Phase 1+2 合并** |
| 关联 | 参考 Hermes(`~/.hermes/profiles`);**单 PydanticAI 助手,不引入多 agent**(CLAUDE.md 铁律) |

## 0. 背景与决策

来自"参考 Hermes 扩展助手"。**单助手 + 持久容器**,不做多 agent/多 profile。本轮把原 Phase 1(人格/记忆/画像)与 Phase 2(skills/MCP)**合并一起做**,让 workspace 成为一个"丰满"的独立容器。关键决策:

- **skill = 指令包**(name + description + markdown 指令),非可执行工具。
- **MCP = 仅远程 + Fernet 加密**(不在服务端跑本地 stdio 进程)。
- **记忆 = 单文档 blob**(沿用,不结构化)。
- **不做自动闭环抽取**(留后续;本轮记忆仅工具驱动)。

## 1. 架构:workspace 作一等容器

`assistant_workspaces`(每用户一行,已实现)= **容器根**,`id` = workspace_id,持三份文档(persona/memory/profile)。子表 FK `workspace_id`:

- `assistant_skills` — 指令包,每条一行。
- `assistant_mcp_servers` — 远程 MCP 配置,每条一行。

全部 owner-only。每用户一个独立 workspace,内含其文档 + 多个 skill + 多个 MCP。

## 2. 数据模型

### 2.1 `assistant_workspaces`(已实现)
`id / tenant_id / user_id(unique) / persona_md / memory_md / profile_md / created_at / updated_at`。

### 2.2 `assistant_skills`(新)
`id / workspace_id (FK) / tenant_id / name / description / instruction_md / enabled(bool) / created_at / updated_at`。

### 2.3 `assistant_mcp_servers`(新)
`id / workspace_id (FK) / tenant_id / name / url / transport('http'|'sse') / credential(JSONB, Fernet 加密,如 {"headers":{"Authorization":"Bearer …"}}) / enabled(bool) / status('active'|'error'|'disabled') / last_error / created_at / updated_at`。

## 3. 读:系统提示注入

`chat_turn` 系统提示 = 基础指令 + 人格(persona_md) + 「## 关于用户」(profile_md) + 「## 记忆」(memory_md) + 「## 技能」(每个**启用**的 skill:`### {name}\n{instruction_md}`)。每轮注入。MCP 工具**不进提示**,走 agent 工具集(§6)。

## 4. 记忆/画像/人格 工具(已实现)

`remember` / `note_about_user` / `rewrite_memory`;`GET` + `PATCH /me/assistant`(部分更新)。**不做自动抽取**。

## 5. Skills(指令包)

- **定义**:`name` + `description` + `instruction_md`(一段 playbook/指令)。无代码执行。
- **注入**:启用的 skill 的 `instruction_md` 拼入系统提示(§3)。本轮**所有启用的都注入**,不做按描述自动选用(YAGNI)。
- **API**(owner-only):`GET/POST /me/assistant/skills`、`PATCH/DELETE /me/assistant/skills/{id}`。
- **前端**:设置面板 Skills 分区(列表 + 增删改 + 启用开关)。
- **自创建(工具驱动,Hermes 式闭环)**:助手工具 `save_skill(name, description, instruction)` / `improve_skill(id, instruction)` —— 在对话中发现可复用做法时**自己沉淀/改进**技能,非纯手动。助手新建默认启用,用户可在面板增删改/关。(更进一步的"复杂任务后全自动蒸馏"留后续。)

## 6. MCP(仅远程 + 凭据加密)— ⚠️ 后续(YAGNI 暂缓,本轮不实现)

> 决策:暂无明确要接的外部 MCP server,故本轮**不实现** MCP;以下为保留的目标设计,有具体需求再做。

- **配置**:每用户配远程 MCP server(`url` + `transport` http|sse + 凭据)。凭据用 `src/core/crypto`(Fernet)加密入库,**复用 integrations 范式**。
- **连接**:对话时,把该用户**启用**的 MCP server 用 PydanticAI 的 MCP 客户端(`MCPServerHTTP`/`MCPServerSSE`,带解密后的 headers)连上,暴露其工具给助手。
- **隔离**:某 server 连不上/出错 → **跳过该 server、不打断对话**,记 `status='error'` + `last_error`。
- **安全**:仅远程(不跑本地进程);凭据加密、**API 永不返回明文**(返回时脱敏为是否已配);只加载**本人**的 server;owner-only。
- **API**(owner-only):`GET/POST /me/assistant/mcp`、`PATCH/DELETE /me/assistant/mcp/{id}`。
- **前端**:设置面板 MCP 分区(列表 + 增删改 + 启用开关 + 凭据输入)。
- ⚠️ **最重、涉密的子系统**,实现排最后;端到端连真实 MCP server 暴露工具需一个真实 server 才能验,这部分靠手动/后续验。

## 7. 隐私 / 成本

owner-only(PM/他人不可见,铁律 §5);MCP 凭据加密、API 脱敏;注入内容不落 `llm_calls`(只记元数据);记忆软上限 ~8KB + `rewrite_memory` 压缩;助手走 Flash 档。

## 8. 测试

- workspace:懒创建 / 部分 PATCH / 注入(已实现,5 个测试)。
- skills:CRUD + **启用的 skill 注入进系统提示**(stub 验证拼装)。
- mcp:CRUD + **凭据库内加密**(非明文)+ API 脱敏 + 连不上优雅跳过。真实工具暴露手动/后续验。

## 9. 范围

**做(本轮)**:workspace 容器(已实现)、skills(指令包:表 + CRUD + 注入 + UI + **自创建工具 save_skill/improve_skill**)。

**不做(后续)**:**MCP(YAGNI 暂缓——无明确外部 server 需求)**、自动闭环抽取/全自动技能蒸馏、结构化多条记忆、工具型 skill、多 agent/多 profile(已否决)。

## 10. 实现顺序

① **skills**(含自创建工具 save_skill/improve_skill)—— 本轮,TDD + 加性迁移。② **MCP** —— 后续(YAGNI 暂缓,有具体外部 server 需求再做)。

## 11. 决策日志

| 决策 | 选择 | 理由 |
|---|---|---|
| skill 形态 | 指令包(非工具) | 简单安全、无执行面;贴 Hermes / agentskills |
| 技能自创建 | 工具驱动(save_skill / improve_skill) | 贴 Hermes 闭环;助手在用中沉淀,非纯手动;成本可控 |
| MCP | **YAGNI 暂缓(本轮不做)** | 暂无明确外部 server 要接;最重最涉密,有需求再实现(设计保留于 §6) |
| MCP 接入(若做) | 仅远程 + Fernet 加密 | 多租户服务端不跑本地进程;复用 integrations 凭据范式 |
| 记忆形态 | 单文档 blob | 沿用 Phase 1;不结构化 |
| 自动抽取 | 不纳入本轮 | 控 LLM 成本;以后再加 |
| workspace | 一等容器(id=根) | 每用户独立;skills/MCP 子表挂其下,可持续扩 |
