# SSO 开发桩（dev stub）设计 — 2026-06-03

## 背景 / 目标

企业 SSO（generic OIDC，附录 M）代码已就绪，但真凭据要等 isbim 的 Entra 管理员
注册 app 后才有（`OIDC_ISSUER` 已确定为 `…/11976f7d-1713-4d0b-b8ef-91960aed1bdc/v2.0`，
缺 `client_id`/`secret`）。在此之前，需要一个**本地开发用的 SSO 仿真桩**：点
"用公司账号登录" → 输邮箱 → 当作 SSO 登录成功，自动开户并登录，先把系统用起来。

设计原则：**只仿真"身份从 IdP 来"这一段，下游全用真实逻辑**。等凭据到了，换掉中间的
OIDC 握手即可，开户 / 会话 / 前端按钮一行不动。

## 非目标

- 不验证 OIDC 密码学（那是 `verify_id_token` 的活，由 `test_sso_e2e.py` 的进程内 IdP 覆盖）。
- 不收/不校验密码（SSO 账号 `password_hash=None`，桩保持一致）。
- 绝不进生产。这是一个完整的认证旁路（输邮箱即登录），必须焊死在开发环境。

## 安全门控（最重要）

- 新增配置 `sso_dev_stub: bool = False`（默认关）。
- 端点硬门控：`if is_production or not sso_dev_stub → 404`。
  **`is_production` 一票否决**——即便有人在生产 env 里误设 `sso_dev_stub=true`，路由仍 404。
  光靠这个 flag 在生产里打不开。
- 启动 fail-fast：生产环境若检测到 `sso_dev_stub=true`，`lifespan` 直接 `raise` 拒绝启动
  （与现有 CRYPTO_KEY / SECRET_KEY 的 prod fail-fast 一致）。路由层的 404 是第二层防御。
- 404（而非 403）以不泄露端点存在（与项目"404 over 403"一致）。
- 域名不在白名单 → 403；邮箱格式非法 → 422。

## 端点

`POST /api/v1/auth/sso/dev-login`，body `{ "email": str, "name": str | null }`

1. 门控检查（见上）。
2. 合成稳定 subject：`sub = f"devstub:{email.lower()}"`（同邮箱二次登录命中
   `get_by_sso_subject`，幂等，不重复建号）。
3. 调用真实的 `resolve_sso_user(session, sub=sub, email=email.lower(), name=name or email前缀)`。
   - 保留域名校验：域名不在 `ALLOWED_EMAIL_DOMAINS` → `PermissionError` → 返回 400/403
     （本地设 `ALLOWED_EMAIL_DOMAINS=isbim.com.hk` 即可放行 isbim 邮箱）。
   - 首个用户自动 `is_admin=is_pm=True`（与真 SSO 一致，附录 L）。
4. `session.commit()` → `create_session_token(str(user.id))` → 设 `session_token` cookie
   （复用真 callback 的 cookie 选项：httponly、`secure=is_production`、samesite=lax、7d）。
5. 返回 `{ "ok": true }`（前端随后刷新进应用）。

复用现有 `resolve_sso_user` / `create_session_token`，**不改动任何真 SSO 逻辑**。

## 前端

- `/auth/sso/status` 增加字段：`{ "enabled": bool, "dev_stub": bool }`。
- 登录页（`frontend/index.html` + `app.js`）：当 `dev_stub` 为真且 `enabled` 为假时，
  在登录区显示一个**仿真登录小表单**：一个邮箱输入框 + "开发登录（仿真 SSO）"按钮，
  提交 `POST /auth/sso/dev-login`，成功后 `location.reload()` 进应用。
  文案明确标注"开发"，与真 SSO 按钮区分，避免误解。

## 测试（`tests/integration/test_sso_dev_stub.py`，沿用 test_sso.py 风格）

1. happy path：flag 开 + 邮箱域名允许 → 开户 + 返回 `session_token` cookie。
2. 幂等：同邮箱两次 → 同一个 user id。
3. flag 关 → 404。
4. **`is_production=True` 时即使 flag 开 → 404**（最关键的安全测试，钉死生产不可用）。
5. 域名不在白名单 → 拒绝（复用 `resolve_sso_user` 行为）。

## 改动面

- `src/core/config.py` — 加 `sso_dev_stub` flag。
- `src/api/routes/sso.py` — 加 `POST /dev-login`；`/status` 加 `dev_stub` 字段；启动 warning。
- `frontend/index.html` + `frontend/app.js` — 仿真登录小表单 + status 处理。
- `tests/integration/test_sso_dev_stub.py` — 上述 5 个测试。
