from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://agentweb:agentweb@localhost:5433/agentweb"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    cors_origins: str = "*"

    platform_commission_rate: float = 0.18

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
