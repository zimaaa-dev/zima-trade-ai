"""
Configuration validation using Pydantic Settings
"""
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    NODE_ROLE: str = Field(default="NODE_A_CLOUD_CORE")
    ENVIRONMENT: str = Field(default="production")

    # Exchange credentials
    BYBIT_API_KEY: str = Field(default="")
    BYBIT_API_SECRET: str = Field(default="")
    BYBIT_TESTNET: bool = Field(default=False)

    OKX_API_KEY: str = Field(default="")
    OKX_API_SECRET: str = Field(default="")
    OKX_PASSPHRASE: str = Field(default="")

    MEXC_API_KEY: str = Field(default="")
    MEXC_API_SECRET: str = Field(default="")

    # Telegram UserBot
    TG_API_ID: int = Field(default=0)
    TG_API_HASH: str = Field(default="")
    TG_SESSION_NAME: str = Field(default="zimatrade_userbot")

    # LLM Endpoints (Node C: Ollama Pool, Node D: Ollama Cloud https://docs.ollama.com/cloud)
    OLLAMA_ENDPOINTS: str = Field(default="http://127.0.0.1:11434")
    OLLAMA_HOST: str = Field(default="https://ollama.com")
    OLLAMA_API_KEY: str = Field(default="")
    OLLAMA_EMBEDDING_MODEL: str = Field(default="bge-m3")
    OLLAMA_MODEL_FAST: str = Field(default="gpt-oss:20b")
    OLLAMA_MODEL_REASONING: str = Field(default="gpt-oss:120b")

    # Risk Firewall (Immutable Hard-limits)
    MAX_RISK_PER_TRADE_PCT: float = Field(default=0.015)  # 1.5%
    MAX_DAILY_DRAWDOWN_PCT: float = Field(default=0.050)  # 5.0%
    MAX_HARD_LEVERAGE: int = Field(default=10)
    SPREAD_GUARD_MAX_PCT: float = Field(default=0.0025)   # 0.25%
    FUNDING_GUARD_MINUTES: int = Field(default=15)
    FUNDING_GUARD_MAX_RATE: float = Field(default=0.001)  # 0.10%

    # Storage
    DATA_DIR: str = Field(default="/app/data")
    SQLITE_DB_PATH: str = Field(default="/app/data/sqlite/zimatrade.db")
    PARQUET_DIR: str = Field(default="/app/data/parquet")
    MAX_LOCAL_STORAGE_GB: int = Field(default=10)

    # Cloudflare Watchdog & Alerting
    WATCHDOG_PING_URL: str = Field(default="")
    WATCHDOG_SECRET_TOKEN: str = Field(default="")
    TELEGRAM_ALERT_CHAT_ID: str = Field(default="")
    TELEGRAM_BOT_TOKEN: str = Field(default="")

    @property
    def ollama_url_list(self) -> List[str]:
        return [url.strip() for url in self.OLLAMA_ENDPOINTS.split(",") if url.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
