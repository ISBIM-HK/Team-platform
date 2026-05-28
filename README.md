# Team Platform

> 团队内部 AI 原生协作平台 — 替代 PingCode 的下一代任务管理与自动化工具。

## 这是什么

为我们 6 人全栈团队定制的内部协作平台。**核心是让 AI 把"目标"变成"分好工的子任务"**：给一个需求/目标，AI 拆解成可执行的子任务并建议由谁来做——你确认后落地，AI 不自动指派、保留"谁有空谁接"的 pull 模式。

围绕这个核心，平台同时消除日常行政开销：从 GitLab / 飞书 / 钉钉 / Notion / 邮箱 / 会议纪要等来源**按需拉取**工作痕迹，自动生成日/周报，免去手动上传与补录。

- 🧩 **AI 拆解 + 分发**（核心）：目标 → 子任务 + 建议负责人 + 估时，走建议确认、保留 pull 认领
- 📊 **AI 自动报告**：工作痕迹自动汇成结构化活动 → 日报每日、周报每周自动产出
- 🎯 **AI 智能建议**：任务抽取、未认领任务推荐分配、重复任务检测
- 💬 **个人 AI 助手**：每人专属对话式助手 + 提醒 / 会议通知

## 当前状态

🚧 **P0 完成，进入 P1 开发** — 后端骨架已跑通（FastAPI + Postgres + Alembic + 邮箱密码登录 + 任务 CRUD + 状态机）。

| Phase | 目标 | 状态 |
|---|---|---|
| P0 | 项目骨架 + 登录 + 空看板 | ✅ 完成 |
| P1 | **核心引擎**：任务拆解 pipeline（目标→子任务+建议负责人）+ 建议确认 UI | 🔜 下一步 |
| P2 | **团队协作**：6 人 + 未认领任务分发建议 + pull 认领 + 团队负载视图 + GitLab | — |
| P3 | 报告自动化：自动日/周报 + 重复检测 + 飞书/钉钉择一 | — |
| P4 | 完善：剩余集成 + 会议纪要 + 调度通知 + PM 对外汇总 | — |
| P5 | SSO + 多租户准备（扩张前夜） | — |

> 产品重心：**AI 拆解 + 分发为核心（P1/P2），捕获→报告为支撑（P3）**。先验证拆解质量与分发采纳率，再扩报告自动化。

预计：业余强度 3~4 个月 / 全职 5~7 周。

## 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Python 3.12 + FastAPI + SQLModel |
| Agent | [PydanticAI](https://ai.pydantic.dev/)（结构化输出，单 Agent + 工具，非多 Agent 框架） |
| LLM | DeepSeek V4 Flash（量大窄任务）+ DeepSeek V4 Pro（拆解/分发/写作） |
| 数据库 | Postgres 16 |
| 调度 | APScheduler（进程内，cron + 一次性任务，承载提醒/报告/通知） |
| 前端 | （同事负责，TBD） |
| 部署 | docker compose + Caddy (TLS) |
| 鉴权 | OIDC SSO（首选）/ 邮箱密码（回退） |

## 设计原则

1. **AI 建议而非直接执行** — 拆解、分发、抽取等所有 AI 产出走 `ai_suggestions` 表等用户确认；分发只建议、不自动指派，保留扁平 pull 模式（半年观察期后再议自动通道）
2. **按需拉取，不持续轮询** — 用户/定时器触发时才调外部 API，省 95% 调用量
3. **隐私基线** — PM 也不能看别人 chat 原文与通知；用户可暂停捕获 / 屏蔽关键词
4. **A 架构 + B-ready 纪律** — 单体起步，但所有边界按"未来切分布式"设计
5. **多租户 day 1 就绪** — 所有表带 `tenant_id`，扩张全公司时不大改

## 开发

**环境要求：** conda（miniconda）、Docker（Postgres 容器）

```bash
# 首次 setup
conda create -n team-platform python=3.12 -y
conda activate team-platform
pip install -e ".[dev]"
docker start teamplat-postgres   # 或 docker compose up -d postgres
alembic upgrade head

# 日常开发
make dev       # uvicorn --reload :8000
make test      # pytest
make migrate name=add_xxx   # 新迁移
make lint      # ruff + mypy
```

Swagger UI: http://localhost:8000/docs

## 部署

```bash
# docker compose 一条命令
docker compose up -d

# 访问
https://team.local:8443
```

详见 `docs/deploy/` (TBD)。

## 设计文档

完整设计有两份：

- `docs/specs/team-platform-design.html` — **交互式设计文档**（已入库，浏览器直接打开，含 ER 图 / 状态机 / 可折叠聚合）
- `docs/specs/2026-05-27-team-platform-design.md` — markdown 源（**gitignored，仅本地保留**）

主要章节：

- §一 用户故事 · §二 统一语言词典 · §三 ER 图 · §四 DDD 聚合设计
- §五 命令与领域事件 · §六 业务边界与规则 · §七 MVP 分期 · §八 风险登记
- §九 开放问题 · §十 决策日志
- 附录 A 捕获层 · B API 契约 · C 部署 & 运维 · D A → B 演进 · E 测试策略 · F 调度与通知

## License

内部项目，未开源。
