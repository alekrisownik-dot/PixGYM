"""Rejestracja i logowanie: funkcje SECURITY DEFINER.

RLS na users przepuszcza tylko własny wiersz, a przy logowaniu i rejestracji nie znamy
jeszcze użytkownika. Te dwie funkcje są jedynym wyjątkiem i robią dokładnie jedną rzecz:
auth_login_lookup zwraca ID i hash hasła dla e-maila, auth_register zakłada konto
z ważnego kodu zaproszenia. Rolę konta (admin) nadaje tylko właściciel bazy (CLI).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-20
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION auth_login_lookup(p_email citext)
        RETURNS TABLE (user_id uuid, password_hash text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
        AS $$
            SELECT u.id, u.password_hash FROM users u
            WHERE u.email = p_email AND u.deleted_at IS NULL
        $$
        """
    )
    # Zły lub zużyty kod: wyjątek z kodem PXINV. Zajęty e-mail: zwykłe unique_violation.
    op.execute(
        """
        CREATE FUNCTION auth_register(
            p_user_id uuid, p_code_hash text, p_email citext, p_password_hash text,
            p_display_name varchar
        ) RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
        AS $$
        BEGIN
            PERFORM 1 FROM invites
            WHERE code_hash = p_code_hash AND used_at IS NULL AND expires_at > now()
            FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'invalid invite' USING ERRCODE = 'PXINV';
            END IF;
            INSERT INTO users (id, email, password_hash, display_name)
            VALUES (p_user_id, p_email, p_password_hash, p_display_name);
            INSERT INTO user_settings (user_id) VALUES (p_user_id);
            UPDATE invites SET used_by = p_user_id, used_at = now()
            WHERE code_hash = p_code_hash;
        END $$
        """
    )
    for fn in (
        "auth_login_lookup(citext)",
        "auth_register(uuid, text, citext, text, varchar)",
    ):
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO pixgym_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION auth_register(uuid, text, citext, text, varchar)")
    op.execute("DROP FUNCTION auth_login_lookup(citext)")
