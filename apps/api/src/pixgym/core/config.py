from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PIXGYM_", env_file=".env", extra="ignore")

    # Rola pixgym_app: podlega RLS, używana przez API.
    database_url: str
    # Właściciel schematu: migracje i seed.
    migrations_database_url: str
    redis_url: str = "redis://localhost:6379/0"
    # Zdjęcia sylwetki: katalog na zaszyfrowane pliki i klucz AES-256 (base64, 32 bajty).
    # Wygeneruj: python -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"
    photo_dir: str = "/data/photos"
    photo_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
