from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PIXGYM_", env_file=".env", extra="ignore")

    # Rola pixgym_app: podlega RLS, używana przez API.
    database_url: str
    # Właściciel schematu: migracje i seed.
    migrations_database_url: str
    redis_url: str = "redis://localhost:6379/0"
    # Bez puli połączeń (testy: każdy klient HTTP ma własną pętlę zdarzeń).
    db_null_pool: bool = False
    # Zdjęcia sylwetki: katalog na zaszyfrowane pliki i klucz AES-256 (base64, 32 bajty).
    # Wygeneruj: python -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"
    photo_dir: str = "/data/photos"
    photo_key: str | None = None
    # Klucz do podpisu tokenów dostępu. Wygeneruj: openssl rand -hex 32
    secret_key: str
    # Ciasteczka tylko po HTTPS. Chrome traktuje http://localhost jako bezpieczne,
    # więc lokalnie też działa; wyłączać tylko przy wejściu po zwykłym http z innego hosta.
    cookie_secure: bool = True
    access_ttl_s: int = 15 * 60
    refresh_ttl_s: int = 30 * 24 * 3600
    invite_ttl_s: int = 7 * 24 * 3600
    # Zbudowany front (apps/web/dist). Brak katalogu = tylko API.
    web_dir: str | None = None
    # Powiadomienia push: klucz VAPID (base64url, 32 bajty). Brak = powiadomienia wyłączone.
    # Wygeneruj: python -m pixgym.services.push
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:pixgym@example.com"
    # Katalog kopii zapasowych (kontener backup) do podglądu w aplikacji. Brak = nie pokazujemy.
    backup_dir: str | None = None
    # Pętla przypomnień w tle (testy ją wyłączają i wołają push.tick same).
    reminders_loop: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
