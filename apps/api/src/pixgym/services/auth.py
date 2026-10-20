"""Konta, logowanie, refresh tokeny i zaproszenia.

Rejestracja i logowanie działają w transakcji bez ustawionego użytkownika i korzystają
z funkcji SECURITY DEFINER (migracja 0007). Reszta działa pod RLS: refresh token ma postać
`<user_id>.<sekret>`, więc najpierw ustawiamy użytkownika, a dopiero potem szukamy hasha.
Podanie cudzego user_id nic nie da, bo pod jego RLS hash nie istnieje.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import Connection, func, insert, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from pixgym.core.config import get_settings
from pixgym.core.ids import uuid7
from pixgym.core.security import (
    hash_password,
    invite_hash,
    needs_rehash,
    new_invite_code,
    random_token,
    sha256,
    verify_password,
)
from pixgym.db.session import set_user_stmt
from pixgym.models import AuditLog, Invite, RefreshToken, User
from pixgym.models.account import UserRole


class InvalidInvite(ValueError):
    pass


class EmailTaken(ValueError):
    pass


@dataclass
class ClientInfo:
    ip: str | None = None
    user_agent: str | None = None


def audit(
    conn: Connection, user_id: uuid.UUID, action: str, client: ClientInfo, **meta: object
) -> None:
    conn.execute(
        insert(AuditLog).values(
            user_id=user_id,
            action=action,
            ip=client.ip,
            user_agent=(client.user_agent or "")[:300] or None,
            meta=meta or None,
        )
    )


def register(
    conn: Connection,
    invite_code: str,
    email: str,
    password: str,
    display_name: str,
    client: ClientInfo,
) -> uuid.UUID:
    user_id = uuid7()
    try:
        conn.execute(
            text("SELECT auth_register(:id, :code, :email, :pw, :name)"),
            {
                "id": user_id,
                "code": invite_hash(invite_code),
                "email": email.strip(),
                "pw": hash_password(password),
                "name": display_name.strip(),
            },
        )
    except IntegrityError as e:
        raise EmailTaken from e
    except DBAPIError as e:
        if getattr(e.orig, "sqlstate", None) == "PXINV":
            raise InvalidInvite from e
        raise
    conn.execute(set_user_stmt(user_id))
    audit(conn, user_id, "register", client)
    return user_id


def authenticate(
    conn: Connection, email: str, password: str, client: ClientInfo
) -> uuid.UUID | None:
    row = conn.execute(
        text("SELECT user_id, password_hash FROM auth_login_lookup(:email)"),
        {"email": email.strip()},
    ).first()
    if not verify_password(row.password_hash if row else None, password):
        return None
    conn.execute(set_user_stmt(row.user_id))
    if needs_rehash(row.password_hash):
        conn.execute(
            update(User).where(User.id == row.user_id).values(password_hash=hash_password(password))
        )
    audit(conn, row.user_id, "login", client)
    return row.user_id


def issue_refresh(conn: Connection, user_id: uuid.UUID, family_id: uuid.UUID | None = None) -> str:
    """Nowy refresh token. Wymaga transakcji z ustawionym user_id."""
    secret = random_token()
    conn.execute(
        insert(RefreshToken).values(
            user_id=user_id,
            family_id=family_id or uuid7(),
            token_hash=sha256(secret),
            expires_at=datetime.now(UTC) + timedelta(seconds=get_settings().refresh_ttl_s),
        )
    )
    return f"{user_id}.{secret}"


def _parse(token: str) -> tuple[uuid.UUID, str] | None:
    uid, _, secret = token.partition(".")
    try:
        return uuid.UUID(uid), secret
    except ValueError:
        return None


def _find(conn: Connection, token: str):
    parsed = _parse(token)
    if parsed is None:
        return None
    user_id, secret = parsed
    conn.execute(set_user_stmt(user_id))
    return conn.execute(
        select(RefreshToken).where(RefreshToken.token_hash == sha256(secret)).with_for_update()
    ).first()


def _revoke_family(conn: Connection, user_id: uuid.UUID, family_id: uuid.UUID) -> None:
    conn.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=func.now())
    )


def rotate_refresh(
    conn: Connection, token: str, client: ClientInfo
) -> tuple[uuid.UUID, str] | None:
    """Wymienia refresh token na nowy. Ponowne użycie starego unieważnia całą rodzinę
    (ktoś mógł go ukraść), więc obie strony muszą zalogować się od nowa."""
    rt = _find(conn, token)
    if rt is None:
        return None
    if rt.revoked_at is not None:
        _revoke_family(conn, rt.user_id, rt.family_id)
        audit(conn, rt.user_id, "refresh_reuse", client)
        return None
    if rt.expires_at <= datetime.now(UTC):
        return None
    deleted = conn.execute(select(User.deleted_at).where(User.id == rt.user_id)).first()
    if deleted is None or deleted.deleted_at is not None:
        return None
    conn.execute(update(RefreshToken).where(RefreshToken.id == rt.id).values(revoked_at=func.now()))
    return rt.user_id, issue_refresh(conn, rt.user_id, rt.family_id)


def logout(conn: Connection, token: str, client: ClientInfo) -> None:
    row = _find(conn, token)
    if row is None:
        return
    _revoke_family(conn, row.user_id, row.family_id)
    audit(conn, row.user_id, "logout", client)


def is_admin(conn: Connection, user_id: uuid.UUID) -> bool:
    role = conn.execute(select(User.role).where(User.id == user_id)).scalar()
    return role == UserRole.admin


@dataclass
class NewInvite:
    code: str
    expires_at: datetime


def create_invite(conn: Connection, user_id: uuid.UUID, client: ClientInfo) -> NewInvite:
    code = new_invite_code()
    expires_at = datetime.now(UTC) + timedelta(seconds=get_settings().invite_ttl_s)
    conn.execute(
        insert(Invite).values(
            code_hash=invite_hash(code), created_by=user_id, expires_at=expires_at
        )
    )
    audit(conn, user_id, "invite_create", client)
    return NewInvite(code, expires_at)


def list_invites(conn: Connection, user_id: uuid.UUID) -> list:
    return list(
        conn.execute(
            select(Invite.created_at, Invite.expires_at, Invite.used_at)
            .where(Invite.created_by == user_id)
            .order_by(Invite.created_at.desc())
            .limit(50)
        ).all()
    )
