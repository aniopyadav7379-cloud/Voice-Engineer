"""
Central configuration. All values are overridable via environment variables
(or a .env file in local dev). Nothing here should be hardcoded elsewhere in
the codebase — import `settings` instead.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # -- App --
    app_name: str = "voice-platform-gateway"
    environment: str = "development"
    log_level: str = "INFO"

    # -- Database --
    database_url: str = "postgresql+asyncpg://voiceplat:voiceplat@localhost:5432/voiceplat"

    # -- Redis --
    redis_url: str = "redis://localhost:6379/0"

    # -- Auth --
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "voice-platform"
    access_token_ttl_seconds: int = 3600

    # -- Rate limiting defaults (per-tenant overrides live in Postgres) --
    default_rate_limit_capacity: int = 50          # burst size (tokens)
    default_rate_limit_refill_per_sec: float = 5.0  # steady-state requests/sec

    # -- Provider routing --
    # Ordered priority list; provider_router walks this list on failure.
    provider_priority: list[str] = ["openai", "groq", "gemini", "azure_openai"]
    provider_timeout_seconds: float = 8.0
    provider_failure_threshold: int = 3       # consecutive failures before circuit opens
    provider_circuit_reset_seconds: int = 30  # how long a circuit stays open

    # -- Conversation memory (Qdrant) --
    # ":memory:" runs Qdrant's embedded local mode — no server needed,
    # good for dev/tests. Point at a real Qdrant URL (e.g.
    # "http://qdrant:6333") in docker-compose/production.
    qdrant_location: str = ":memory:"
    memory_top_k: int = 3

    # -- Provider credentials (set the ones you have; router skips missing ones) --
    openai_api_key: str | None = None
    groq_api_key: str | None = None
    gemini_api_key: str | None = None
    azure_openai_api_key: str | None = None
    azure_openai_endpoint: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
