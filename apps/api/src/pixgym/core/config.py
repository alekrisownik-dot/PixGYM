from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PIXGYM_", env_file=".env", extra="ignore")

    # Rola pixgym_app: podlega RLS, używana przez API.
    database_url: str
    # Właściciel schematu: migracje i seed.
    migrations_database_url: str
    redis_url: str = "redis://localhost:6379/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
