"""Izolacja danych: rola aplikacji nie może odczytać ani zmienić cudzych danych."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from pixgym.core.ids import uuid7
from pixgym.models import (
    Exercise,
    Program,
    ProgramExercise,
    SessionExercise,
    User,
    WorkoutSession,
    WorkoutSet,
)
from pixgym.seed import builtin_id
from pixgym.seed.catalog_data import EXERCISES

USER_TABLES = ["workout_sessions", "session_exercises", "sets"]


def count(conn, table: str) -> int:
    return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()


def test_owner_sees_own_workout(as_user, alice_bob):
    with as_user(alice_bob["alice"]) as conn:
        for table in USER_TABLES:
            assert count(conn, table) == 1, table


def test_cannot_read_other_users_workout(as_user, alice_bob):
    with as_user(alice_bob["bob"]) as conn:
        for table in USER_TABLES:
            assert count(conn, table) == 0, table
        # Także po bezpośrednim ID.
        row = conn.execute(
            select(WorkoutSession).where(WorkoutSession.id == alice_bob["workout"]["session"])
        ).first()
        assert row is None


def test_without_user_context_nothing_is_visible(as_user, alice_bob):
    with as_user(None) as conn:
        for table in [*USER_TABLES, "users"]:
            assert count(conn, table) == 0, table


def test_cannot_modify_or_delete_other_users_data(as_user, alice_bob):
    session_id = alice_bob["workout"]["session"]
    with as_user(alice_bob["bob"]) as conn:
        res = conn.execute(
            update(WorkoutSession).where(WorkoutSession.id == session_id).values(notes="hacked")
        )
        assert res.rowcount == 0
        res = conn.execute(text("DELETE FROM sets"))
        assert res.rowcount == 0
    with as_user(alice_bob["alice"]) as conn:
        assert count(conn, "sets") == 1


def test_cannot_insert_rows_owned_by_someone_else(as_user, alice_bob):
    with as_user(alice_bob["bob"]) as conn, pytest.raises(DBAPIError, match="row-level security"):
        conn.execute(
            insert(WorkoutSession).values(
                id=uuid7(),
                user_id=alice_bob["alice"],
                started_at=datetime.now(UTC),
                local_date=date.today(),
            )
        )


def test_cannot_attach_own_set_to_other_users_exercise(as_user, alice_bob):
    # Złożony klucz obcy (session_exercise_id, user_id) blokuje podpięcie pod cudzy trening.
    with as_user(alice_bob["bob"]) as conn, pytest.raises(IntegrityError):
        conn.execute(
            insert(WorkoutSet).values(
                id=uuid7(),
                user_id=alice_bob["bob"],
                session_exercise_id=alice_bob["workout"]["session_exercise"],
                set_index=1,
                reps=5,
            )
        )


def test_custom_exercise_is_private(as_user, alice_bob):
    with as_user(alice_bob["alice"]) as conn:
        conn.execute(
            insert(Exercise).values(
                id=uuid7(),
                owner_user_id=alice_bob["alice"],
                name="Wyciskanie z gumą",
                equipment_id=1,
                tracking="weight_reps",
            )
        )
        assert (
            conn.execute(select(func.count()).select_from(Exercise)).scalar_one()
            == len(EXERCISES) + 1
        )
        conn.commit()
    with as_user(alice_bob["bob"]) as conn:
        visible = conn.execute(select(func.count()).select_from(Exercise)).scalar_one()
        assert visible == len(EXERCISES)


def test_builtin_catalog_is_read_only(as_user, alice_bob):
    with as_user(alice_bob["alice"]) as conn:
        res = conn.execute(
            update(Exercise).where(Exercise.owner_user_id.is_(None)).values(name="x")
        )
        assert res.rowcount == 0
    with as_user(alice_bob["alice"]) as conn, pytest.raises(DBAPIError, match="row-level security"):
        conn.execute(
            insert(Exercise).values(
                id=uuid7(),
                owner_user_id=None,
                name="Nowe wbudowane",
                equipment_id=1,
                tracking="weight_reps",
            )
        )


def test_templates_visible_but_read_only(as_user, alice_bob):
    with as_user(alice_bob["alice"]) as conn:
        templates = conn.execute(
            select(func.count()).select_from(Program).where(Program.is_template)
        ).scalar_one()
        assert templates >= 6
        assert conn.execute(select(func.count()).select_from(ProgramExercise)).scalar_one() > 0
        res = conn.execute(update(ProgramExercise).values(target_sets=1))
        assert res.rowcount == 0


def test_user_sees_only_own_account(as_user, alice_bob):
    with as_user(alice_bob["alice"]) as conn:
        ids = conn.execute(select(User.id)).scalars().all()
        assert ids == [alice_bob["alice"]]


def test_user_cannot_grant_self_admin(as_user, alice_bob):
    with as_user(alice_bob["alice"]) as conn, pytest.raises(DBAPIError, match="permission denied"):
        conn.execute(update(User).where(User.id == alice_bob["alice"]).values(role="admin"))


def test_app_role_cannot_bypass_rls(app_engine):
    with app_engine.connect() as conn:
        row = conn.execute(
            text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
        ).one()
        assert row == (False, False)
        # Rola aplikacji nie jest właścicielem tabel (właściciel omija RLS).
        owned = conn.execute(
            text(
                "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"
                " AND tableowner = current_user"
            )
        ).scalar_one()
        assert owned == 0


def test_every_table_with_user_data_has_rls(owner):
    without_rls = (
        owner.execute(
            text(
                "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace"
                " WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity"
            )
        )
        .scalars()
        .all()
    )
    assert sorted(without_rls) == [
        "alembic_version",
        "equipment",
        "movement_patterns",
        "muscle_groups",
    ]


def test_session_exercise_must_reference_own_session(as_user, alice_bob):
    with as_user(alice_bob["bob"]) as conn, pytest.raises(IntegrityError):
        conn.execute(
            insert(SessionExercise).values(
                id=uuid7(),
                user_id=alice_bob["bob"],
                session_id=alice_bob["workout"]["session"],
                exercise_id=builtin_id("exercise", "back_squat"),
                position=1,
            )
        )
