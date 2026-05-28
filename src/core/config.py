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

    # LLM — DeepSeek (cheap=Flash 量大窄任务, strong=Pro 拆解/分发/写作)
    # NOTE: 确认真实 provider:model 字符串与 DeepSeek API key 接入方式后再定稿。
    llm_api_key: str = ""
    llm_model_cheap: str = "deepseek:deepseek-v4-flash"
    llm_model_strong: str = "deepseek:deepseek-v4-pro"

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
