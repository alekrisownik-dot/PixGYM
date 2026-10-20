"""Konto: rejestracja z zaproszenia, logowanie, wylogowanie, profil, zaproszenia (admin)."""

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update

from pixgym.api.deps import (
    REFRESH_COOKIE,
    UserId,
    anon_tx,
    clear_auth_cookies,
    client_info,
    set_auth_cookies,
    user_tx,
)
from pixgym.core import ratelimit
from pixgym.models import User, UserSettings
from pixgym.schemas import InviteListItem, InviteOut, LoginIn, MeIn, MeOut, RegisterIn
from pixgym.services import auth

router = APIRouter()

LOGIN_LIMIT = 5  # prób na minutę (na adres IP i osobno na e-mail)
REGISTER_LIMIT = 10  # prób na godzinę z jednego IP


async def _me(conn, user_id) -> MeOut:
    row = (
        await conn.execute(
            select(
                User.id,
                User.email,
                User.display_name,
                User.role,
                User.sex,
                User.birth_year,
                UserSettings.leaderboard_visible,
            )
            .outerjoin(UserSettings, UserSettings.user_id == User.id)
            .where(User.id == user_id)
        )
    ).one()
    data = row._asdict()
    data["leaderboard_visible"] = data["leaderboard_visible"] is not False
    return MeOut(**data)


@router.post("/auth/register", response_model=MeOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, request: Request, response: Response) -> MeOut:
    client = client_info(request)
    if not await ratelimit.hit(f"register:{client.ip}", REGISTER_LIMIT, 3600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_attempts")
    try:
        async with anon_tx() as conn:
            user_id = await conn.run_sync(
                auth.register,
                body.invite_code,
                str(body.email),
                body.password,
                body.display_name,
                client,
            )
            refresh = await conn.run_sync(auth.issue_refresh, user_id)
            me = await _me(conn, user_id)
    except auth.InvalidInvite:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid_invite") from None
    except auth.EmailTaken:
        raise HTTPException(status.HTTP_409_CONFLICT, "email_taken") from None
    set_auth_cookies(response, user_id, refresh)
    return me


@router.post("/auth/login", response_model=MeOut)
async def login(body: LoginIn, request: Request, response: Response) -> MeOut:
    client = client_info(request)
    email = body.email.strip().lower()
    if not (
        await ratelimit.hit(f"login:ip:{client.ip}", LOGIN_LIMIT, 60)
        and await ratelimit.hit(f"login:email:{email}", LOGIN_LIMIT, 60)
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_attempts")
    async with anon_tx() as conn:
        user_id = await conn.run_sync(auth.authenticate, email, body.password, client)
        if user_id is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")
        refresh = await conn.run_sync(auth.issue_refresh, user_id)
        me = await _me(conn, user_id)
    await ratelimit.reset(f"login:email:{email}")
    set_auth_cookies(response, user_id, refresh)
    return me


@router.post("/auth/refresh", status_code=status.HTTP_204_NO_CONTENT)
async def refresh(request: Request) -> Response:
    token = request.cookies.get(REFRESH_COOKIE)
    result = None
    if token:
        async with anon_tx() as conn:
            result = await conn.run_sync(auth.rotate_refresh, token, client_info(request))
    if result is None:
        # Zwracamy odpowiedź zamiast wyjątku, żeby dotarło czyszczenie ciasteczek.
        response = JSONResponse({"detail": "session_expired"}, status.HTTP_401_UNAUTHORIZED)
        clear_auth_cookies(response)
        return response
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    set_auth_cookies(response, *result)
    return response


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response) -> None:
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        async with anon_tx() as conn:
            await conn.run_sync(auth.logout, token, client_info(request))
    clear_auth_cookies(response)


@router.get("/me", response_model=MeOut)
async def me(user_id: UserId) -> MeOut:
    async with user_tx(user_id) as conn:
        return await _me(conn, user_id)


@router.patch("/me", response_model=MeOut)
async def update_me(body: MeIn, user_id: UserId) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    visible = changes.pop("leaderboard_visible", None)
    async with user_tx(user_id) as conn:
        if changes:
            await conn.execute(update(User).where(User.id == user_id).values(**changes))
        if visible is not None:
            await conn.execute(
                update(UserSettings)
                .where(UserSettings.user_id == user_id)
                .values(leaderboard_visible=visible)
            )
        return await _me(conn, user_id)


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(request: Request, user_id: UserId) -> InviteOut:
    async with user_tx(user_id) as conn:
        if not await conn.run_sync(auth.is_admin, user_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "admin_only")
        invite = await conn.run_sync(auth.create_invite, user_id, client_info(request))
    return InviteOut(code=invite.code, expires_at=invite.expires_at)


@router.get("/invites", response_model=list[InviteListItem])
async def list_invites(user_id: UserId) -> list:
    async with user_tx(user_id) as conn:
        return await conn.run_sync(auth.list_invites, user_id)
