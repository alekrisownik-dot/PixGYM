"""Triggery wersji synchronizacji, rola aplikacji, uprawnienia i Row-Level Security.

API łączy się rolą pixgym_app, która nie jest właścicielem tabel, więc obowiązują ją
polityki RLS. Użytkownika ustawia set_config('app.user_id', ..., true) na początku
transakcji (pixgym.db.session.user_session). Bez tego ustawienia app_user_id() zwraca
NULL i żadna polityka nie przepuszcza wierszy.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tabele z kolumnami updated_at i server_version (mixin Versioned).
VERSIONED = [
    "user_settings",
    "exercises",
    "progression_rules",
    "programs",
    "program_versions",
    "program_days",
    "program_exercises",
    "workout_sessions",
    "session_exercises",
    "sets",
    "personal_records",
    "body_measurements",
]

# Słowniki wspólne dla wszystkich: tylko odczyt, bez RLS.
LOOKUPS = ["muscle_groups", "equipment", "movement_patterns"]

# Tabele z kolumną user_id: każdy widzi i zmienia wyłącznie swoje wiersze.
OWNED_BY_USER_ID = [
    "user_settings",
    "refresh_tokens",
    "mfa_totp",
    "recovery_codes",
    "workout_sessions",
    "session_exercises",
    "sets",
    "personal_records",
    "body_measurements",
    "sync_ops",
    "sync_conflicts",
    "data_jobs",
]

# Tabele z owner_user_id: NULL = wbudowane (wszyscy czytają, nikt nie zmienia).
OWNED_OR_BUILTIN = ["exercises", "progression_rules", "programs"]

# Tabele zależne: widoczność dziedziczona z rodzica. Podzapytanie w polityce też podlega
# RLS rodzica, więc EXISTS widzi tylko wiersze, które użytkownik może czytać.
CHILDREN = {
    # tabela: (rodzic, kolumna w tabeli, warunek zapisu na rodzicu)
    "exercise_muscles": ("exercises", "exercise_id", "p.owner_user_id = app_user_id()"),
    "program_versions": ("programs", "program_id", "p.owner_user_id = app_user_id()"),
    "program_days": (
        "program_versions",
        "program_version_id",
        "EXISTS (SELECT 1 FROM programs g WHERE g.id = p.program_id"
        " AND g.owner_user_id = app_user_id())",
    ),
    "program_exercises": (
        "program_days",
        "program_day_id",
        "EXISTS (SELECT 1 FROM program_versions v JOIN programs g ON g.id = v.program_id"
        " WHERE v.id = p.program_version_id AND g.owner_user_id = app_user_id())",
    ),
}


def upgrade() -> None:
    # --- server_version: globalny licznik zmian, po nim telefon pobiera różnice ---
    op.execute("CREATE SEQUENCE sync_version_seq AS bigint")
    op.execute(
        """
        CREATE FUNCTION pixgym_touch() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            NEW.server_version := nextval('sync_version_seq');
            IF TG_OP = 'UPDATE' THEN
                NEW.updated_at := now();
            END IF;
            RETURN NEW;
        END $$
        """
    )
    for t in VERSIONED:
        op.execute(
            f"CREATE TRIGGER {t}_touch BEFORE INSERT OR UPDATE ON {t}"
            " FOR EACH ROW EXECUTE FUNCTION pixgym_touch()"
        )

    # --- rola aplikacji ---
    # W Dockerze tworzy ją z hasłem infra/postgres/initdb. Tu tylko na wypadek innej
    # instalacji (np. baza testowa), bez możliwości logowania.
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pixgym_app') THEN
                CREATE ROLE pixgym_app NOLOGIN;
            END IF;
        END $$
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO pixgym_app")
    op.execute("GRANT USAGE ON SEQUENCE sync_version_seq TO pixgym_app")
    op.execute(f"GRANT SELECT ON {', '.join(LOOKUPS)} TO pixgym_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON"
        f" {', '.join(OWNED_BY_USER_ID + OWNED_OR_BUILTIN + list(CHILDREN))},"
        " invites TO pixgym_app"
    )
    # Bez kolumny role: użytkownik nie nada sobie admina. Konto zakłada etap 3.
    op.execute(
        "GRANT SELECT, UPDATE (email, password_hash, display_name, sex, birth_year, timezone,"
        " deleted_at) ON users TO pixgym_app"
    )
    # Dziennik zdarzeń tylko się dopisuje.
    op.execute("GRANT SELECT, INSERT ON audit_log TO pixgym_app")
    op.execute("GRANT USAGE ON SEQUENCE audit_log_id_seq TO pixgym_app")

    # --- RLS ---
    op.execute(
        """
        CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT nullif(current_setting('app.user_id', true), '')::uuid
        $$
        """
    )

    def enable(table: str) -> None:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    for t in [*OWNED_BY_USER_ID, "audit_log"]:
        enable(t)
        op.execute(
            f"CREATE POLICY own ON {t} USING (user_id = app_user_id())"
            " WITH CHECK (user_id = app_user_id())"
        )

    # Konto: odczyt i zmiana tylko własnego. Rejestracja i logowanie (szukanie po e-mailu,
    # zanim znamy użytkownika) dojdą w etapie 3 jako funkcje SECURITY DEFINER.
    enable("users")
    op.execute("CREATE POLICY self_read ON users FOR SELECT USING (id = app_user_id())")
    op.execute(
        "CREATE POLICY self_update ON users FOR UPDATE"
        " USING (id = app_user_id()) WITH CHECK (id = app_user_id())"
    )

    enable("invites")
    op.execute(
        "CREATE POLICY own ON invites"
        " USING (created_by = app_user_id() OR used_by = app_user_id())"
        " WITH CHECK (created_by = app_user_id())"
    )

    for t in OWNED_OR_BUILTIN:
        enable(t)
        op.execute(
            f"CREATE POLICY read ON {t} FOR SELECT"
            " USING (owner_user_id IS NULL OR owner_user_id = app_user_id())"
        )
        op.execute(
            f"CREATE POLICY write ON {t}"
            " USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id())"
        )

    for t, (parent, fk, write_cond) in CHILDREN.items():
        enable(t)
        op.execute(
            f"CREATE POLICY read ON {t} FOR SELECT"
            f" USING (EXISTS (SELECT 1 FROM {parent} p WHERE p.id = {t}.{fk}))"
        )
        cond = f"EXISTS (SELECT 1 FROM {parent} p WHERE p.id = {t}.{fk} AND {write_cond})"
        op.execute(f"CREATE POLICY write ON {t} USING ({cond}) WITH CHECK ({cond})")


def downgrade() -> None:
    for t in [*OWNED_BY_USER_ID, *OWNED_OR_BUILTIN, *CHILDREN, "audit_log", "users", "invites"]:
        op.execute(f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY")
        for policy in ("own", "read", "write", "self_read", "self_update"):
            op.execute(f"DROP POLICY IF EXISTS {policy} ON {t}")
    op.execute("DROP FUNCTION app_user_id()")
    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM pixgym_app")
    op.execute("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM pixgym_app")
    op.execute("REVOKE USAGE ON SCHEMA public FROM pixgym_app")
    for t in VERSIONED:
        op.execute(f"DROP TRIGGER {t}_touch ON {t}")
    op.execute("DROP FUNCTION pixgym_touch()")
    op.execute("DROP SEQUENCE sync_version_seq")
