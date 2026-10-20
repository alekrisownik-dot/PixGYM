"""Testy działają na prawdziwym Postgresie, w osobnej bazie pixgym_test.

Właściciel (migracje, przygotowanie danych) omija RLS. Rola pixgym_app, tak jak API,
podlega politykom, więc na niej sprawdzamy izolację użytkowników.
"""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, create_engine, insert, make_url, text

from pixgym.core.config import get_settings
from pixgym.core.ids import uuid7
from pixgym.db.session import set_user_stmt
from pixgym.models import SessionExercise, User, WorkoutSession, WorkoutSet
from pixgym.seed import builtin_id, seed

TEST_DB = "pixgym_test"
API_DIR = __file__.rsplit("/tests/", 1)[0]


@pytest.fixture(scope="session")
def owner_engine() -> Iterator[Engine]:
    settings = get_settings()
    admin_url = make_url(settings.migrations_database_url)
    admin = create_engine(admin_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)"))
        conn.execute(text(f"CREATE DATABASE {TEST_DB}"))
    admin.dispose()

    url = admin_url.set(database=TEST_DB)
    cfg = Config(f"{API_DIR}/alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url.render_as_string(hide_password=False))
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")

    engine = create_engine(url)
    with engine.begin() as conn:
        seed(conn)
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def app_engine(owner_engine: Engine) -> Iterator[Engine]:
    url = make_url(get_settings().database_url).set(database=TEST_DB)
    engine = create_engine(url)
    yield engine
    engine.dispose()


@pytest.fixture
def owner(owner_engine: Engine) -> Iterator[Connection]:
    with owner_engine.begin() as conn:
        yield conn


@pytest.fixture
def as_user(app_engine: Engine):
    """as_user(uid) -> połączenie roli aplikacji z ustawionym użytkownikiem (lub bez: None)."""

    @contextmanager
    def _as_user(user_id: uuid.UUID | None) -> Iterator[Connection]:
        with app_engine.connect() as conn, conn.begin() as tx:
            if user_id is not None:
                conn.execute(set_user_stmt(user_id))
            yield conn
            if tx.is_active:
                tx.rollback()

    return _as_user


def make_user(conn: Connection, name: str = "test") -> uuid.UUID:
    uid = uuid7()
    conn.execute(
        insert(User).values(
            id=uid, email=f"{name}-{uid}@example.com", password_hash="x", display_name=name
        )
    )
    return uid


def make_workout(conn: Connection, user_id: uuid.UUID) -> dict[str, uuid.UUID]:
    """Trening z jednym ćwiczeniem (wyciskanie) i jedną serią."""
    session_id, se_id, set_id = uuid7(), uuid7(), uuid7()
    conn.execute(
        insert(WorkoutSession).values(
            id=session_id, user_id=user_id, started_at=datetime.now(UTC), local_date=date.today()
        )
    )
    conn.execute(
        insert(SessionExercise).values(
            id=se_id,
            user_id=user_id,
            session_id=session_id,
            exercise_id=builtin_id("exercise", "bench_press"),
            position=0,
        )
    )
    conn.execute(
        insert(WorkoutSet).values(
            id=set_id, user_id=user_id, session_exercise_id=se_id, set_index=0, weight_kg=80, reps=8
        )
    )
    return {"session": session_id, "session_exercise": se_id, "set": set_id}


@pytest.fixture
def alice_bob(owner_engine: Engine) -> Iterator[dict[str, object]]:
    """Dwóch użytkowników; Alice ma trening. Sprzątane po teście."""
    with owner_engine.begin() as conn:
        alice, bob = make_user(conn, "alice"), make_user(conn, "bob")
        workout = make_workout(conn, alice)
    yield {"alice": alice, "bob": bob, "workout": workout}
    with owner_engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE id IN (:a, :b)"), {"a": alice, "b": bob})
