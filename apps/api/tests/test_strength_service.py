"""Przeliczanie serii i rekordów w bazie (rola aplikacji, pod RLS)."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import insert, select, update

from pixgym.core.ids import uuid7
from pixgym.models import (
    BodyMeasurement,
    PersonalRecord,
    SessionExercise,
    UserSettings,
    WorkoutSession,
    WorkoutSet,
)
from pixgym.seed import builtin_id
from pixgym.services.strength import refresh_exercise
from tests.conftest import make_user

BENCH = builtin_id("exercise", "bench_press")
PULL_UP = builtin_id("exercise", "pull_up")


def at(day: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, day, 10, minute, tzinfo=UTC)


def add_session(conn, user_id, exercise_id, day, sets, bodyweight=None):
    """sets: [(typ, kg, powt., rpe, added_kg)] -> id serii w tej kolejności."""
    session_id, se_id = uuid7(), uuid7()
    conn.execute(
        insert(WorkoutSession).values(
            id=session_id,
            user_id=user_id,
            started_at=at(day),
            local_date=date(2026, 7, day),
            bodyweight_kg=bodyweight,
        )
    )
    conn.execute(
        insert(SessionExercise).values(
            id=se_id, user_id=user_id, session_id=session_id, exercise_id=exercise_id, position=0
        )
    )
    ids = []
    for i, (set_type, kg, reps, rpe, added) in enumerate(sets):
        set_id = uuid7()
        conn.execute(
            insert(WorkoutSet).values(
                id=set_id,
                user_id=user_id,
                session_exercise_id=se_id,
                set_index=i,
                set_type=set_type,
                weight_kg=kg,
                added_kg=added,
                reps=reps,
                rpe=rpe,
                completed_at=at(day, i + 1),
            )
        )
        ids.append(set_id)
    return ids


@pytest.fixture
def lifter(owner_engine):
    with owner_engine.begin() as conn:
        uid = make_user(conn, "lifter")
        week1 = add_session(
            conn,
            uid,
            BENCH,
            1,
            [("warmup", 60, 5, None, None), ("working", 80, 8, 8, None)],
        )
        week2 = add_session(conn, uid, BENCH, 8, [("working", 90, 5, 9, None)])
        conn.execute(
            insert(BodyMeasurement).values(
                id=uuid7(), user_id=uid, measured_at=at(1), weight_kg=Decimal("80")
            )
        )
        pulls = add_session(conn, uid, PULL_UP, 9, [("working", None, 6, None, 20)])
    yield {"user": uid, "warmup": week1[0], "w80": week1[1], "w90": week2[0], "pull": pulls[0]}
    with owner_engine.begin() as conn:
        conn.execute(WorkoutSession.__table__.delete().where(WorkoutSession.user_id == uid))
        conn.execute(PersonalRecord.__table__.delete().where(PersonalRecord.user_id == uid))


def current_records(conn, user_id, exercise_id):
    rows = conn.execute(
        select(PersonalRecord.record_type, PersonalRecord.reps, PersonalRecord.value).where(
            PersonalRecord.user_id == user_id,
            PersonalRecord.exercise_id == exercise_id,
            PersonalRecord.superseded_at.is_(None),
            PersonalRecord.deleted_at.is_(None),
        )
    ).all()
    return {(t, r): float(v) for t, r, v in rows}


def set_values(conn, set_id):
    row = conn.execute(
        select(WorkoutSet.effective_kg, WorkoutSet.e1rm_kg).where(WorkoutSet.id == set_id)
    ).one()
    return tuple(float(x) if x is not None else None for x in row)


def test_fills_set_metrics_and_records(as_user, lifter):
    uid = lifter["user"]
    with as_user(uid) as conn:
        res = refresh_exercise(conn, uid, BENCH)
        assert res.sets_updated == 3
        assert set_values(conn, lifter["warmup"]) == (60.0, None)
        assert set_values(conn, lifter["w80"]) == (80.0, 101.33)
        assert set_values(conn, lifter["w90"]) == (90.0, 105.0)
        assert current_records(conn, uid, BENCH) == {
            ("e1rm", None): 105.0,
            ("rep_max", 2): 90.0,
            ("rep_max", 3): 90.0,
            ("rep_max", 5): 90.0,
            ("rep_max", 8): 80.0,
            ("set_volume", None): 640.0,
        }


def test_second_refresh_changes_nothing(as_user, lifter):
    uid = lifter["user"]
    with as_user(uid) as conn:
        refresh_exercise(conn, uid, BENCH)
        versions = conn.execute(select(PersonalRecord.server_version)).scalars().all()
        res = refresh_exercise(conn, uid, BENCH)
        assert (res.sets_updated, res.records_written, res.records_removed) == (0, 0, 0)
        assert conn.execute(select(PersonalRecord.server_version)).scalars().all() == versions


def test_deleting_record_set_restores_previous_record(as_user, lifter):
    uid = lifter["user"]
    with as_user(uid) as conn:
        refresh_exercise(conn, uid, BENCH)
        conn.execute(
            update(WorkoutSet)
            .where(WorkoutSet.id == lifter["w90"])
            .values(deleted_at=datetime.now(UTC))
        )
        res = refresh_exercise(conn, uid, BENCH)
        assert res.records_removed == 4  # e1rm, 2RM, 3RM, 5RM z serii 90 kg
        assert current_records(conn, uid, BENCH) == {
            ("e1rm", None): 101.33,
            ("rep_max", 2): 80.0,
            ("rep_max", 3): 80.0,
            ("rep_max", 5): 80.0,
            ("rep_max", 8): 80.0,
            ("set_volume", None): 640.0,
        }
        # Usunięte rekordy zostają jako miękko usunięte, żeby telefon je zsynchronizował.
        deleted = (
            conn.execute(
                select(PersonalRecord.set_id).where(PersonalRecord.deleted_at.is_not(None))
            )
            .scalars()
            .all()
        )
        assert set(deleted) == {lifter["w90"]}


def test_bodyweight_from_last_measurement(as_user, lifter):
    uid = lifter["user"]
    with as_user(uid) as conn:
        refresh_exercise(conn, uid, PULL_UP)
        # 80 kg masy ciała × 1.0 + 20 kg obciążenia
        assert set_values(conn, lifter["pull"]) == (100.0, 120.0)
        records = current_records(conn, uid, PULL_UP)
        assert records[("e1rm", None)] == 120.0
        assert ("bodyweight_reps", None) not in records  # seria z obciążeniem


def test_user_settings_method_is_used(as_user, owner_engine, lifter):
    uid = lifter["user"]
    with owner_engine.begin() as conn:
        conn.execute(insert(UserSettings).values(user_id=uid, e1rm_method="rpe"))
    with as_user(uid) as conn:
        refresh_exercise(conn, uid, BENCH)
        # 80 × 8 @ RPE 8 = 10 powt. w tabeli RTS (73.9%)
        assert set_values(conn, lifter["w80"]) == (80.0, 108.25)


def test_other_user_cannot_refresh_someone_elses_sets(as_user, owner_engine, lifter):
    with owner_engine.begin() as conn:
        intruder = make_user(conn, "intruder")
    with as_user(intruder) as conn:
        res = refresh_exercise(conn, lifter["user"], BENCH)
        assert (res.sets_updated, res.records_written) == (0, 0)
    with as_user(lifter["user"]) as conn:
        assert set_values(conn, lifter["w80"]) == (None, None)
