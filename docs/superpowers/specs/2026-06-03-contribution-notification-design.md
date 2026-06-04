# Contribution 到达通知 + 助手 Context 注入 — 2026-06-03

## 目标

让投送的 contribution **被用户和助手"看到"**:
1. 投送到达时自动创建通知 → 网页铃铛亮
2. 助手 chat 的 system prompt 注入最近投送 → 问"最近做了什么"能回答

## 改动

### 1. POST /me/contributions 后创建通知
- 在 `events_cache` 写入后,追加一条 `Notification`:
  - `kind=NotificationKind.system`(复用已有 enum 值,避免 PG enum migration）
  - `title=f"本地投送: {summary[:80]}"`
  - `source_ref={"event_id": str(event.id), "kind": req.kind}`
  - `recipient_user_id=current_user.id`（通知自己）
- `visibility=self` 的投送**也通知**（个人备忘也该提醒自己看到）

### 2. 助手 system prompt 注入最近 contribution
- `_inject_workspace` 里新增一段:查最近 5 条本人 contribution（`events_cache` where
  `actor_user_id=user_id, source=agent`, 按 `occurred_at desc`, limit 5）
- 格式化为"最近投送的工作"段落,注入 system prompt
- `visibility=self` 的也注入（助手是个人的,看得到自己的备忘）

### 3. 不改 PG enum、不加 migration

## 测试
1. POST contribution → 产生一条 notification（kind=system, title 含 summary）
2. 助手 context 包含最近 contribution（通过检查 _inject_workspace 返回值）

## 改动面
- `src/api/routes/contributions.py` — POST 后创建 notification
- `src/ai/assistant.py` — `_inject_workspace` 加 contribution 段
