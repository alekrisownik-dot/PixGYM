"""Hasła, tokeny dostępu i losowe sekrety."""

import hashlib
import secrets
import time
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from pixgym.core.config import get_settings

_hasher = PasswordHasher()
# Porównanie z tym hashem, gdy konta nie ma: logowanie trwa tyle samo i nie zdradza e-maili.
_DUMMY_HASH = _hasher.hash("pixgym-dummy-password")

ACCESS_AUDIENCE = "pixgym-access"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    now = int(time.time())
    return jwt.encode(
        {
            "sub": str(user_id),
            "aud": ACCESS_AUDIENCE,
            "iat": now,
            "exp": now + settings.access_ttl_s,
        },
        settings.secret_key,
        algorithm="HS256",
    )


def read_access_token(token: str) -> uuid.UUID | None:
    try:
        claims = jwt.decode(
            token, get_settings().secret_key, algorithms=["HS256"], audience=ACCESS_AUDIENCE
        )
        return uuid.UUID(claims["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


def random_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def sha256(value: str) -> bytes:
    return hashlib.sha256(value.encode()).digest()


def invite_hash(code: str) -> str:
    # Kod ma 80 bitów losowości, więc wystarczy szybki hash (bez soli).
    return hashlib.sha256(normalize_invite(code).encode()).hexdigest()


def new_invite_code() -> str:
    """Kod do przepisania z telefonu: 16 znaków bez mylących (0/O, 1/I), w grupach po 4."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(16))
    return "-".join(raw[i : i + 4] for i in range(0, 16, 4))


def normalize_invite(code: str) -> str:
    return "".join(c for c in code.upper() if c.isalnum())
