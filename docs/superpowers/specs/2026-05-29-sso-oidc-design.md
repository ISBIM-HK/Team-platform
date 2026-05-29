# 公司 SSO(通用 OIDC) — 设计文档

| 字段 | 值 |
|---|---|
| 日期 | 2026-05-29 |
| 状态 | 待用户复审 |
| 范围 | 通用 OIDC 单点登录:授权码流程 + 回调 + 自动开通/关联 + 全局 env 配置 + 前端按钮;与邮箱密码**并存**。复用现有 cookie 会话。 |
| 关联 | 设计原把 SSO 列 P5、OIDC 首选;本轮提前。`users.sso_subject` 字段已存。角色随 admin-roles spec 的 bootstrap。 |

## 0. 背景与决策

现状:仅邮箱密码(`auth/register`+`login`,cookie 会话 httpOnly+SameSite=Lax);`sso_subject` 未用。决策:

- **通用 OIDC**(任何标准 OIDC IdP:Authentik/Keycloak/Google/Azure AD/Okta…),`authlib` + discovery。
- **自动开通**:邮箱域名在 `ALLOWED_EMAIL_DOMAINS` 内 → 首次 SSO 自动建账号;**按 email 关联**已有邮箱密码账号(写 `sso_subject`)。
- **全局 env 配置**(单租户 MVP)。
- 与邮箱密码并存;复用 `create_session_token` 的同一 cookie 会话。

## 1. 流程(OIDC 授权码)

- `GET /auth/sso/login` → 据 discovery 拼授权 URL,种 `state`(CSRF)+ `nonce`(短时 httpOnly cookie),302 跳 IdP。SSO 未配置则 404/禁用。
- `GET /auth/sso/callback?code&state` → 校验 state → 用 code 换 token → 验 `id_token`(JWKS 签名 / iss / aud / exp / nonce)→ 取 `sub`、`email`、`name` → `resolve_sso_user` → `create_session_token` 种同一 session cookie → 302 跳 `/`。失败 → 跳登录页带错误。

## 2. resolve_sso_user(纯逻辑,可单测)

输入已验证 claims `{sub, email, name}`,顺序:
1. 按 `sso_subject == sub` 命中 → 返回该用户(更新 last_seen)。
2. 否则按 `email` 命中(已有账号)→ **关联**:写 `sso_subject = sub` → 返回。
3. 否则 email 域名 ∈ `ALLOWED_EMAIL_DOMAINS` → **自动开通**:在默认租户建用户(`sso_subject=sub`、`display_name=name`、无密码),建 **per-user Inbox**;**角色按 bootstrap**(该租户首个用户 → admin+pm,否则 member 无特权)→ 返回。
4. 否则(域名不允许)→ 拒绝(callback 返登录页"域名不允许")。

## 3. 配置(env)

`OIDC_ISSUER`(discovery base)、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI`;四项齐全 → SSO 启用。`client_secret` 只在 env(不入库/repo)。

## 4. 库

`authlib`(OIDC 客户端,discovery + JWKS + token)+ 现有 `httpx`。加入依赖。

## 5. 安全

- `state` 防 CSRF、`nonce` 防重放;均存 httpOnly cookie,callback 校验后清除。
- 严格验 `id_token`:JWKS 验签、`iss`/`aud`/`exp`/`nonce` 校验。
- prod 下 cookie `secure`;client_secret 仅 env。

## 6. 前端

登录页在 SSO 启用时显示"用公司账号登录"按钮 → `window.location = /api/v1/auth/sso/login`。回调成功后落 cookie、跳 `/`。邮箱密码登录仍在。

## 7. 测试

- `resolve_sso_user`:按 sub 命中 / 按 email 关联(写 sso_subject)/ 域名内自动开通(+ 角色 bootstrap + Inbox)/ 域名外拒绝。
- callback 错误路径(state 不符 / id_token 无效)→ 不建会话。
- ⚠️ OIDC 握手(discovery / 换 token / JWKS)端到端需**真实 IdP**才能验,标注手动 / 后续(可用测试 IdP 如本地 Keycloak)。

## 8. 范围

**做**:通用 OIDC `login`+`callback`、`resolve_sso_user`(开通/关联)、env 配置、前端按钮;与邮箱密码并存。

**不做**:每租户 SSO(P5+ 多租户)、飞书/钉钉/企业微信专有适配、SCIM 自动同步、IdP 单点登出(SLO)、刷新 token/长期会话(沿用现 7 天 cookie)。

## 9. 决策日志

| 决策 | 选择 | 理由 |
|---|---|---|
| 协议 | 通用 OIDC(authlib+discovery) | 设计首选 OIDC;最通用 |
| 开通/关联 | 域名白名单自动开通 + 按 email 关联 | 低摩擦;复用现有域名门控;避免重号 |
| 配置 | 全局 env | 单租户 MVP;per-tenant 留 P5+ |
| 会话 | 复用 cookie + create_session_token | 与邮箱密码统一,非 JWT(设计) |
| 角色 | 随 admin-roles bootstrap(首用户 admin+pm,否则 member) | 与权限层级一致 |
