"""Przeliczanie serii i rekordów jednego ćwiczenia po zmianie w treningu.

Wywoływać w transakcji użytkownika (RLS), po zapisie serii z synchronizacji.
Funkcja jest synchroniczna; z kodu async: `await conn.run_sync(refresh_exercise, ...)`.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Connection, bindparam, func, select, update

from pixgym.db.upsert import upsert
from pixgym.domain.e1rm import DEFAULT_MAX_REPS, effective_weight, estimate_1rm
from pixgym.domain.records import RecordSet, record_history
from pixgym.models import (
    BodyMeasurement,
    Exercise,
    PersonalRecord,
    SessionExercise,
    UserSettings,
    WorkoutSession,
    WorkoutSet,
)

_RECORD_NAMESPACE = uuid.UUID("b3a1f0d2-5c7e-4e19-8f63-0d2c4a9b7e15")


@dataclass
class RefreshResult:
    sets_updated: int = 0
    records_written: int = 0
    records_removed: int = 0


def record_id(set_id: uuid.UUID, record_type: str, reps: int | None) -> uuid.UUID:
    """Stałe ID rekordu: ta sama seria i typ dają ten sam wiersz przy każdym przeliczeniu."""
    return uuid.uuid5(_RECORD_NAMESPACE, f"{set_id}:{record_type}:{reps}")


def _f(x: Decimal | None) -> float | None:
    return float(x) if x is not None else None


def _d(x: float | None) -> Decimal | None:
    return Decimal(str(x)) if x is not None else None


def _iso(dt: datetime) -> str:
    # Stały format, żeby porównanie tekstowe dawało kolejność w czasie.
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def refresh_exercise(
    conn: Connection, user_id: uuid.UUID, exercise_id: uuid.UUID, now: datetime | None = None
) -> RefreshResult:
    """Liczy effective_kg i e1rm_kg serii oraz historię rekordów. Zapisuje tylko zmiany."""
    result = RefreshResult()
    exercise = conn.execute(
        select(Exercise.tracking, Exercise.bw_factor).where(Exercise.id == exercise_id)
    ).one_or_none()
    if exercise is None:
        return result
    settings = conn.execute(
        select(UserSettings.e1rm_method, UserSettings.e1rm_max_reps).where(
            UserSettings.user_id == user_id
        )
    ).one_or_none()
    method, max_reps = settings if settings else ("epley", DEFAULT_MAX_REPS)

    # Masa ciała: z treningu, a gdy jej brak, z ostatniego pomiaru przed treningiem.
    last_measurement = (
        select(BodyMeasurement.weight_kg)
        .where(
            BodyMeasurement.user_id == WorkoutSession.user_id,
            BodyMeasurement.measured_at <= WorkoutSession.started_at,
            BodyMeasurement.weight_kg.is_not(None),
            BodyMeasurement.deleted_at.is_(None),
        )
        .order_by(BodyMeasurement.measured_at.desc())
        .limit(1)
        .correlate(WorkoutSession)
        .scalar_subquery()
    )
    rows = conn.execute(
        select(
            WorkoutSet.id,
            WorkoutSet.set_type,
            WorkoutSet.weight_kg,
            WorkoutSet.added_kg,
            WorkoutSet.reps,
            WorkoutSet.rpe,
            WorkoutSet.rir,
            WorkoutSet.effective_kg,
            WorkoutSet.e1rm_kg,
            func.coalesce(WorkoutSet.completed_at, WorkoutSession.started_at).label("at"),
            func.coalesce(WorkoutSession.bodyweight_kg, last_measurement).label("bodyweight"),
        )
        .join(SessionExercise, SessionExercise.id == WorkoutSet.session_exercise_id)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .where(
            SessionExercise.user_id == user_id,
            SessionExercise.exercise_id == exercise_id,
            WorkoutSet.deleted_at.is_(None),
            SessionExercise.deleted_at.is_(None),
            WorkoutSession.deleted_at.is_(None),
        )
    ).all()

    changed, record_sets, achieved = [], [], {}
    for r in rows:
        eff = effective_weight(
            exercise.tracking,
            _f(r.weight_kg),
            _f(r.added_kg),
            _f(r.bodyweight),
            _f(exercise.bw_factor),
        )
        # Rozgrzewki nie liczą się do szacowanego 1RM ani rekordów.
        e1rm = (
            estimate_1rm(eff, r.reps, _f(r.rpe), r.rir, method, max_reps)
            if r.set_type != "warmup"
            else None
        )
        if (_d(eff), _d(e1rm)) != (r.effective_kg, r.e1rm_kg):
            changed.append({"_id": r.id, "effective_kg": _d(eff), "e1rm_kg": _d(e1rm)})
        at = _iso(r.at)
        achieved[at] = r.at
        record_sets.append(
            RecordSet(
                id=str(r.id),
                achieved_at=at,
                tracking=exercise.tracking,
                set_type=r.set_type,
                reps=r.reps,
                effective_kg=eff,
                e1rm_kg=e1rm,
                added_kg=_f(r.added_kg),
            )
        )

    if changed:
        conn.execute(
            update(WorkoutSet)
            .where(WorkoutSet.id == bindparam("_id"))
            .values(effective_kg=bindparam("effective_kg"), e1rm_kg=bindparam("e1rm_kg")),
            changed,
        )
        result.sets_updated = len(changed)

    desired = [
        {
            "id": record_id(uuid.UUID(e.set_id), e.record_type, e.reps),
            "user_id": user_id,
            "exercise_id": exercise_id,
            "record_type": e.record_type,
            "reps": e.reps,
            "value": _d(e.value),
            "set_id": uuid.UUID(e.set_id),
            "achieved_at": achieved[e.achieved_at],
            "superseded_at": achieved[e.superseded_at] if e.superseded_at else None,
            "deleted_at": None,
        }
        for e in record_history(record_sets)
    ]

    # Kolejność ma znaczenie dla indeksu „jeden aktualny rekord”: najpierw znikają stare
    # wiersze i oznaczamy pobite, dopiero potem zapisujemy nowe aktualne.
    stale = conn.execute(
        update(PersonalRecord)
        .where(
            PersonalRecord.user_id == user_id,
            PersonalRecord.exercise_id == exercise_id,
            PersonalRecord.deleted_at.is_(None),
            PersonalRecord.id.not_in([d["id"] for d in desired]),
        )
        .values(deleted_at=now or func.now())
    )
    result.records_removed = stale.rowcount
    superseded = [d for d in desired if d["superseded_at"] is not None]
    current = [d for d in desired if d["superseded_at"] is None]
    result.records_written = upsert(conn, PersonalRecord, superseded, ["id"]) + upsert(
        conn, PersonalRecord, current, ["id"]
    )
    return result
