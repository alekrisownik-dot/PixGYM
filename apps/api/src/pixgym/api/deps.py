"""Wspólne zależności endpointów: zalogowany użytkownik, transakcja z RLS, ciasteczka."""

import ipaddress
import secrets
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncConnection

from pixgym.core.config import get_settings
from pixgym.core.security import create_access_token, read_access_token
from pixgym.db.session import get_engine, set_user_stmt
from pixgym.services.auth import ClientInfo

ACCESS_COOKIE = "pixgym_access"
REFRESH_COOKIE = "pixgym_refresh"
CSRF_COOKIE = "pixgym_csrf"
CSRF_HEADER = "x-csrf-token"
# Refresh token trafia tylko do endpointów logowania.
REFRESH_PATH = "/api/v1/auth"

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _ip(value: str | None) -> str | None:
    try:
        return str(ipaddress.ip_address(value.strip())) if value else None
    except ValueError:
        return None


def client_info(request: Request) -> ClientInfo:
    # Port API słucha tylko na 127.0.0.1, więc przed nami jest wyłącznie lokalne proxy
    # (tailscale serve). Ostatni wpis X-Forwarded-For dopisało właśnie ono.
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1]
    return ClientInfo(
        ip=_ip(forwarded) or _ip(request.client.host if request.client else None),
        user_agent=request.headers.get("user-agent"),
    )


def set_auth_cookies(response: Response, user_id: uuid.UUID, refresh_token: str) -> None:
    settings = get_settings()
    common = dict(httponly=True, secure=settings.cookie_secure, samesite="strict")
    response.set_cookie(
        ACCESS_COOKIE, create_access_token(user_id), max_age=settings.access_ttl_s, **common
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=settings.refresh_ttl_s,
        path=REFRESH_PATH,
        **common,
    )


def clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    common = dict(httponly=True, secure=settings.cookie_secure, samesite="strict")
    response.delete_cookie(ACCESS_COOKIE, **common)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH, **common)


async def csrf_middleware(request: Request, call_next):
    """Double-submit: ciasteczko pixgym_csrf (czytelne dla JS) musi zgadzać się z nagłówkiem.

    Razem z SameSite=Strict blokuje to wysyłanie formularzy z obcych stron.
    """
    cookie = request.cookies.get(CSRF_COOKIE)
    if (
        request.url.path.startswith("/api/")
        and request.method not in SAFE_METHODS
        and (not cookie or not secrets.compare_digest(cookie, request.headers.get(CSRF_HEADER, "")))
    ):
        response = JSONResponse({"detail": "csrf"}, status_code=status.HTTP_403_FORBIDDEN)
    else:
        response = await call_next(request)
    if not cookie:
        response.set_cookie(
            CSRF_COOKIE,
            secrets.token_urlsafe(32),
            secure=get_settings().cookie_secure,
            samesite="strict",
        )
    return response


def current_user_id(request: Request) -> uuid.UUID:
    token = request.cookies.get(ACCESS_COOKIE)
    user_id = read_access_token(token) if token else None
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not_authenticated")
    return user_id


UserId = Annotated[uuid.UUID, Depends(current_user_id)]


# Transakcje otwierane w samym endpoincie (a nie w zależności z yield), żeby commit
# na pewno nastąpił przed wysłaniem odpowiedzi.
@asynccontextmanager
async def anon_tx() -> AsyncIterator[AsyncConnection]:
    """Transakcja bez użytkownika (rejestracja, logowanie, odświeżenie tokenu)."""
    async with get_engine().begin() as conn:
        yield conn


@asynccontextmanager
async def user_tx(user_id: uuid.UUID) -> AsyncIterator[AsyncConnection]:
    """Transakcja widząca tylko dane użytkownika (RLS)."""
    async with get_engine().begin() as conn:
        await conn.execute(set_user_stmt(user_id))
        yield conn
