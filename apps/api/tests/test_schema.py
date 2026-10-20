"""Ograniczenia w bazie, wersjonowanie zmian i dane startowe."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.exc import IntegrityError

from pixgym.core.ids import uuid7
from pixgym.models import (
    Exercise,
    ExerciseMuscle,
    PersonalRecord,
    Program,
    ProgramDay,
    ProgramVersion,
    WorkoutSet,
)
from pixgym.seed import builtin_id, seed
from pixgym.seed.programs_data import TEMPLATES


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("rpe", 8.3),
        ("rpe", 10.5),
        ("rpe", 0.5),
        ("reps", 101),
        ("reps", -1),
        ("weight_kg", 1000.5),
        ("weight_kg", -2.5),
        ("rir", 11),
    ],
)
def test_set_rejects_invalid_values(owner_engine, alice_bob, column, value):
    with owner_engine.begin() as conn, pytest.raises(IntegrityError, match="ck_sets_"):
        conn.execute(
            update(WorkoutSet)
            .where(WorkoutSet.id == alice_bob["workout"]["set"])
            .values({column: value})
        )


@pytest.mark.parametrize(("column", "value"), [("rpe", 8.5), ("rpe", 10), ("reps", 0)])
def test_set_accepts_valid_values(owner_engine, alice_bob, column, value):
    with owner_engine.begin() as conn:
        conn.execute(
            update(WorkoutSet)
            .where(WorkoutSet.id == alice_bob["workout"]["set"])
            .values({column: value})
        )


def test_update_bumps_server_version_and_updated_at(owner_engine, alice_bob):
    set_id = alice_bob["workout"]["set"]
    query = select(WorkoutSet.server_version, WorkoutSet.updated_at).where(WorkoutSet.id == set_id)
    with owner_engine.begin() as conn:
        v1, t1 = conn.execute(query).one()
    with owner_engine.begin() as conn:
        conn.execute(update(WorkoutSet).where(WorkoutSet.id == set_id).values(reps=9))
    with owner_engine.begin() as conn:
        v2, t2 = conn.execute(query).one()
    assert v2 > v1
    assert t2 > t1


def test_client_cannot_set_server_version(owner_engine, alice_bob):
    set_id = alice_bob["workout"]["set"]
    with owner_engine.begin() as conn:
        conn.execute(update(WorkoutSet).where(WorkoutSet.id == set_id).values(server_version=1))
        version = conn.execute(
            select(WorkoutSet.server_version).where(WorkoutSet.id == set_id)
        ).scalar_one()
    assert version > 1


def _record(user_id, superseded: bool = False, reps=None, record_type="e1rm"):
    return insert(PersonalRecord).values(
        id=uuid7(),
        user_id=user_id,
        exercise_id=builtin_id("exercise", "bench_press"),
        record_type=record_type,
        reps=reps,
        value=100,
        achieved_at=datetime.now(UTC),
        superseded_at=datetime.now(UTC) if superseded else None,
    )


def test_only_one_current_record_per_type(owner_engine, alice_bob):
    alice = alice_bob["alice"]
    with owner_engine.begin() as conn:
        conn.execute(_record(alice, superseded=True))
        conn.execute(_record(alice, superseded=True))
        conn.execute(_record(alice))
        # Różne rep_max to osobne rekordy.
        conn.execute(_record(alice, reps=3, record_type="rep_max"))
        conn.execute(_record(alice, reps=5, record_type="rep_max"))
    with owner_engine.begin() as conn, pytest.raises(IntegrityError, match="uq_personal_records"):
        conn.execute(_record(alice))


def test_rep_max_requires_reps(owner_engine, alice_bob):
    with owner_engine.begin() as conn, pytest.raises(IntegrityError, match="reps_only_for_rep_max"):
        conn.execute(_record(alice_bob["alice"], record_type="rep_max"))


def test_record_survives_set_deletion(owner_engine, alice_bob):
    alice, set_id = alice_bob["alice"], alice_bob["workout"]["set"]
    rec = _record(alice).values(set_id=set_id)
    with owner_engine.begin() as conn:
        rec_id = conn.execute(rec.returning(PersonalRecord.id)).scalar_one()
        conn.execute(text("DELETE FROM sets WHERE id = :id"), {"id": set_id})
        row = conn.execute(
            select(PersonalRecord.set_id, PersonalRecord.user_id).where(PersonalRecord.id == rec_id)
        ).one()
    assert row == (None, alice)


def test_seed_catalog(owner):
    exercises = owner.execute(
        select(func.count()).select_from(Exercise).where(Exercise.owner_user_id.is_(None))
    ).scalar_one()
    assert exercises >= 150
    without_primary = (
        owner.execute(
            text(
                "SELECT e.slug FROM exercises e WHERE e.owner_user_id IS NULL AND NOT EXISTS"
                " (SELECT 1 FROM exercise_muscles m"
                " WHERE m.exercise_id = e.id AND m.role = 'primary')"
            )
        )
        .scalars()
        .all()
    )
    assert without_primary == []
    contributions = owner.execute(
        select(ExerciseMuscle.role, ExerciseMuscle.contribution).distinct()
    ).all()
    assert sorted((r, float(c)) for r, c in contributions) == [("primary", 1.0), ("secondary", 0.5)]


def test_seed_templates(owner):
    for tpl in TEMPLATES:
        program_id = builtin_id("program", tpl.slug)
        version = owner.execute(
            select(ProgramVersion.id).where(
                ProgramVersion.program_id == program_id, ProgramVersion.is_current
            )
        ).scalar_one()
        days = owner.execute(
            select(func.count())
            .select_from(ProgramDay)
            .where(ProgramDay.program_version_id == version)
        ).scalar_one()
        assert days == len(tpl.days), tpl.slug
    names = owner.execute(select(Program.name).where(Program.is_template)).scalars().all()
    assert {"FBW A/B", "Upper / Lower", "Push / Pull / Legs", "GZCLP", "nSuns 5 dni"} <= set(names)


def test_seed_is_idempotent(owner_engine):
    query = text(
        "SELECT (SELECT max(server_version) FROM exercises),"
        " (SELECT max(server_version) FROM program_exercises),"
        " (SELECT count(*) FROM exercise_muscles)"
    )
    with owner_engine.begin() as conn:
        before = conn.execute(query).one()
        seed(conn)
        after = conn.execute(query).one()
    # Ponowny seed niczego nie zmienia, więc telefony nie pobierają katalogu od nowa.
    assert before == after
