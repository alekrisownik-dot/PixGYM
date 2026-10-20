"""Polecenia administratora, uruchamiane jako właściciel bazy (omija RLS).

    python -m pixgym.admin create-admin EMAIL NAZWA   # pierwsze konto, hasło z klawiatury
    python -m pixgym.admin invite EMAIL_ADMINA        # kod zaproszenia dla znajomego
    python -m pixgym.admin set-password EMAIL         # reset hasła

W Dockerze: docker-compose exec api python -m pixgym.admin ...
"""

import argparse
import getpass
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import Connection, create_engine, insert, select, update

from pixgym.core.config import get_settings
from pixgym.core.ids import uuid7
from pixgym.core.security import hash_password, invite_hash, new_invite_code
from pixgym.models import Invite, RefreshToken, User, UserSettings
from pixgym.models.account import UserRole

MIN_PASSWORD = 10


def _password() -> str:
    while True:
        pw = getpass.getpass("Hasło (min. 10 znaków): ")
        if len(pw) < MIN_PASSWORD:
            print("Za krótkie.")
        elif pw != getpass.getpass("Powtórz hasło: "):
            print("Hasła się różnią.")
        else:
            return pw


def _user_id(conn: Connection, email: str):
    uid = conn.execute(select(User.id).where(User.email == email)).scalar()
    if uid is None:
        sys.exit(f"Nie ma konta {email}")
    return uid


def create_admin(conn: Connection, email: str, name: str, password: str) -> None:
    uid = uuid7()
    conn.execute(
        insert(User).values(
            id=uid,
            email=email,
            password_hash=hash_password(password),
            display_name=name,
            role=UserRole.admin,
        )
    )
    conn.execute(insert(UserSettings).values(user_id=uid))


def create_invite(conn: Connection, admin_email: str) -> str:
    code = new_invite_code()
    conn.execute(
        insert(Invite).values(
            code_hash=invite_hash(code),
            created_by=_user_id(conn, admin_email),
            expires_at=datetime.now(UTC) + timedelta(seconds=get_settings().invite_ttl_s),
        )
    )
    return code


def set_password(conn: Connection, email: str, password: str) -> None:
    uid = _user_id(conn, email)
    conn.execute(update(User).where(User.id == uid).values(password_hash=hash_password(password)))
    # Po zmianie hasła wylogowujemy wszystkie urządzenia.
    conn.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == uid, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m pixgym.admin")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("create-admin", help="pierwsze konto (administrator)")
    p.add_argument("email")
    p.add_argument("name")
    p = sub.add_parser("invite", help="kod zaproszenia ważny 7 dni")
    p.add_argument("admin_email")
    p = sub.add_parser("set-password", help="nowe hasło, wylogowuje wszędzie")
    p.add_argument("email")
    args = parser.parse_args()

    engine = create_engine(get_settings().migrations_database_url)
    if args.cmd == "create-admin":
        password = _password()
        with engine.begin() as conn:
            create_admin(conn, args.email, args.name, password)
        print(f"Konto {args.email} założone. Zaloguj się w aplikacji.")
    elif args.cmd == "invite":
        with engine.begin() as conn:
            code = create_invite(conn, args.admin_email)
        print(f"Kod zaproszenia (ważny 7 dni, jednorazowy): {code}")
    elif args.cmd == "set-password":
        password = _password()
        with engine.begin() as conn:
            set_password(conn, args.email, password)
        print("Hasło zmienione, wszystkie sesje wylogowane.")


if __name__ == "__main__":
    main()
