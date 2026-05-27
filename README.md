# Team Platform

> 团队内部 AI 原生协作平台 — 替代 PingCode 的下一代任务管理与自动化工具。

## 这是什么

为我们 6 人全栈团队定制的内部协作平台，**核心价值是消除日常行政开销**：
- ✋ 不用手动每日上传工作内容
- ✋ 不用手动写周报
- ✋ 不用补录忘记创建的任务

通过自动从 GitLab / 飞书 / 钉钉 / Notion / 邮箱 / 会议纪要等来源**按需拉取**工作痕迹，配合每人专属 AI 助手，实现：

- 📋 **AI 自动捕获**：日常工作痕迹自动汇聚成结构化活动
- 📊 **AI 自动报告**：日报每日自动生成、周报每周自动产出
- 🎯 **AI 智能建议**：任务自动抽取、未认领任务推荐分配、重复任务检测
- 💬 **个人 AI 助手**：每人专属对话式助手，处理"打杂"工作

## 当前状态

🚧 **设计阶段（pre-P0）** — 完整设计文档已完成，待评审后启动 P0 骨架开发。

| Phase | 目标 | 状态 |
|---|---|---|
| P0 | 项目骨架 + 登录 + 空看板 | ⏳ Pending |
| P1 | 单用户能用 + GitLab 集成 + 手动日报 | — |
| P2 | 6 人团队能用 + AI 自动日报 + 飞书/钉钉择一 | — |
| P3 | 自动周报 + 智能分发 + PM 团队负载视图 | — |
| P4 | 剩余集成完整 + 会议纪要 + 通知 webhook | — |
| P5 | SSO + 多租户准备（扩张前夜） | — |

预计：业余强度 3~4 个月 / 全职 5~7 周。

## 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Python 3.12 + FastAPI + SQLModel |
| Agent | [PydanticAI](https://ai.pydantic.dev/) |
| LLM | Claude Haiku 4.5（量大窄任务）+ Sonnet 4.5（决策/写作） |
| 数据库 | Postgres 16 |
| 前端 | （同事负责，TBD） |
| 部署 | docker compose + Caddy (TLS) |
| 鉴权 | OIDC SSO（首选）/ 邮箱密码（回退） |

## 设计原则

1. **按需拉取，不持续轮询** — 用户/定时器触发时才调外部 API，省 95% 调用量
2. **AI 建议而非直接执行** — 所有 AI 产出走 `ai_suggestions` 表等用户确认（半年观察期后再讨论自动通道）
3. **隐私基线**：PM 也不能看别人 chat 原文；用户可暂停捕获 / 屏蔽关键词
4. **A 架构 + B-ready 纪律**：单体起步，但所有边界按"未来切分布式"设计
5. **多租户 day 1 就绪**：所有表带 `tenant_id`，扩张全公司时不大改

## 开发

> ⚠️ 项目还在设计阶段，以下命令尚未实现。这里只是 P0 完成后的预期入口。

```bash
make setup     # uv sync + pre-commit + 起 postgres 容器
make dev       # uvicorn --reload + 前端 dev
make test      # pytest
make migrate name=add_xxx   # 新迁移
make lint      # ruff + mypy
```

## 部署

```bash
# docker compose 一条命令
docker compose up -d

# 访问
https://team.local:8443
```

详见 `docs/deploy/` (TBD)。

## 设计文档

完整设计在 `docs/specs/2026-05-27-team-platform-design.md`（**本目录 gitignored，仅本地保留**）。

主要章节：
- §1 数据模型
- §2 捕获层（按需拉取）
- §3 AI 处理层
- §4 个人 AI 助手
- §5 Auth & 权限
- §6 API 契约
- §7 部署 & 运维
- §8 演进路径 A → B
- §9 MVP 分期
- §10 测试策略
- §11 风险登记
- §13 决策日志

## 团队

| 角色 | 谁 |
|---|---|
| 设计/后端 | Limbo |
| 前端 | （同事，TBD） |
| 试用团队 | 内部 6 人全栈组 |
| PM（对外） | （TBD） |

## License

内部项目，未开源。
