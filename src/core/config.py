"""Application configuration — single source of truth.

Reads from environment / .env. Fail-fast on missing required values.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://app:devpassword@localhost:5432/teamplat"
    database_url_sync: str = "postgresql+psycopg2://app:devpassword@localhost:5432/teamplat"

    # Security
    secret_key: str = "dev-secret-key-not-for-production"
    crypto_key: str = ""  # Fernet key for encrypting credentials; required in prod

    # App
    log_level: str = "DEBUG"
    app_env: str = "development"  # development | staging | production

    # Registration — self-signup gated to company email domain(s)
    allowed_email_domains: str = ""  # comma-separated, e.g. "acme.com,acme.cn"; empty = closed
    default_tenant_name: str = "Default Team"  # all self-registrants join this single tenant (MVP)

    @property
    def allowed_domains(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_email_domains.split(",") if d.strip()]

    # SSO — generic OIDC (附录 M). All four set → SSO enabled. secret only in env.
    oidc_issuer: str = ""  # discovery base, e.g. https://idp.acme.com/realms/main
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_redirect_uri: str = ""  # e.g. https://app.acme.com/api/v1/auth/sso/callback

    # SSO dev stub — LOCAL ONLY. Fakes "company login": enter email → auto-provision +
    # session, no IdP/crypto. A full auth bypass; startup fail-fasts and the route 404s
    # in production regardless of this flag. Never set in a deployed env.
    sso_dev_stub: bool = False

    @property
    def sso_enabled(self) -> bool:
        return bool(self.oidc_issuer and self.oidc_client_id and self.oidc_client_secret and self.oidc_redirect_uri)

    # LLM — DeepSeek (cheap=Flash 量大窄任务, strong=Pro 拆解/分发/写作)
    # NOTE: 确认真实 provider:model 字符串与 DeepSeek API key 接入方式后再定稿。
    llm_api_key: str = ""
    llm_model_cheap: str = "deepseek:deepseek-v4-flash"
    llm_model_strong: str = "deepseek:deepseek-v4-pro"

    # App URL (for Telegram webhook registration etc.)
    app_base_url: str = ""  # e.g. https://app.example.com

    # Budget
    batch_budget_per_user_per_day: int = 60_000
    chat_budget_per_user_per_day: int = 80_000
    monthly_hard_cap_usd: float = 500.0

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
