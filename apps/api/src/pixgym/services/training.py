"""Treningi, ćwiczenia w treningu i serie. Wywoływać w transakcji użytkownika (RLS).

Po każdej zmianie serii przeliczamy ćwiczenie (services/strength.py), więc odpowiedź
od razu zawiera szacowany 1RM i informację o nowym rekordzie.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, and_, exists, func, insert, select, update
from sqlalchemy.orm import aliased

from pixgym.core.ids import uuid7
from pixgym.models import (
    Equipment,
    Exercise,
    PersonalRecord,
    ProgramDay,
    SessionExercise,
    User,
    WorkoutSession,
    WorkoutSet,
)
from pixgym.services.catalog import photos_by_exercise
from pixgym.services.errors import NotFound
from pixgym.services.programs import day_targets, day_version
from pixgym.services.strength import refresh_exercise

SET_FIELDS = (
    "set_index",
    "set_type",
    "side",
    "weight_kg",
    "added_kg",
    "reps",
    "duration_s",
    "distance_m",
    "rpe",
    "rir",
    "completed_at",
)


def list_exercises(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        select(
            Exercise.id,
            Exercise.slug,
            Exercise.name,
            Exercise.tracking,
            Exercise.is_unilateral,
            Equipment.name.label("equipment"),
            (Exercise.owner_user_id.is_not(None)).label("custom"),
            Exercise.notes,
            Exercise.per_side,
        )
        .join(Equipment, Equipment.id == Exercise.equipment_id)
        .where(Exercise.deleted_at.is_(None))
        .order_by(Exercise.name)
    ).all()
    photos = photos_by_exercise(conn)
    return [{**r._asdict(), "photos": photos.get(r.id, [])} for r in rows]


def _local_date(conn: Connection, user_id: uuid.UUID, at: datetime):
    tz = conn.execute(select(User.timezone).where(User.id == user_id)).scalar_one()
    return at.astimezone(ZoneInfo(tz)).date()


def start_session(
    conn: Connection,
    user_id: uuid.UUID,
    session_id: uuid.UUID | None = None,
    started_at: datetime | None = None,
    bodyweight_kg: Decimal | None = None,
    program_day_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """Nowy trening (wolny albo z dnia planu). Ponowne wysłanie z tym samym ID
    (kolejka offline) nic nie robi."""
    session_id = session_id or uuid7()
    if conn.execute(select(WorkoutSession.id).where(WorkoutSession.id == session_id)).first():
        return session_id
    started_at = started_at or datetime.now(UTC)
    conn.execute(
        insert(WorkoutSession).values(
            id=session_id,
            user_id=user_id,
            started_at=started_at,
            local_date=_local_date(conn, user_id, started_at),
            bodyweight_kg=bodyweight_kg,
            program_day_id=program_day_id,
            program_version_id=day_version(conn, program_day_id) if program_day_id else None,
        )
    )
    return session_id


def _live(model):
    return model.deleted_at.is_(None)


def list_sessions(conn: Connection, user_id: uuid.UUID, limit: int = 30) -> list[dict[str, Any]]:
    se, st = SessionExercise, WorkoutSet
    working = and_(st.set_type != "warmup", _live(st))
    stats = (
        select(
            se.session_id,
            # Ćwiczenie bez serii (pominięte) nie liczy się do „N ćwiczeń”.
            func.count(func.distinct(se.id)).filter(working).label("exercise_count"),
            func.count(st.id).filter(working).label("set_count"),
            func.coalesce(func.sum(st.effective_kg * st.reps).filter(working), 0).label(
                "tonnage_kg"
            ),
        )
        .outerjoin(st, and_(st.session_exercise_id == se.id))
        .where(_live(se))
        .group_by(se.session_id)
        .subquery()
    )
    rows = conn.execute(
        select(
            WorkoutSession.id,
            WorkoutSession.started_at,
            WorkoutSession.ended_at,
            WorkoutSession.local_date,
            func.coalesce(stats.c.exercise_count, 0).label("exercise_count"),
            func.coalesce(stats.c.set_count, 0).label("set_count"),
            func.coalesce(stats.c.tonnage_kg, 0).label("tonnage_kg"),
        )
        .outerjoin(stats, stats.c.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user_id, _live(WorkoutSession))
        .order_by(WorkoutSession.started_at.desc())
        .limit(limit)
    ).all()
    return [r._asdict() for r in rows]


def _session_row(conn: Connection, session_id: uuid.UUID):
    row = conn.execute(
        select(WorkoutSession).where(WorkoutSession.id == session_id, _live(WorkoutSession))
    ).first()
    if row is None:
        raise NotFound
    return row


def get_session(conn: Connection, session_id: uuid.UUID) -> dict[str, Any]:
    s = _session_row(conn, session_id)
    exercises = conn.execute(
        select(
            SessionExercise.id,
            SessionExercise.exercise_id,
            SessionExercise.position,
            SessionExercise.notes,
            Exercise.name,
            Exercise.tracking,
        )
        .join(Exercise, Exercise.id == SessionExercise.exercise_id)
        .where(SessionExercise.session_id == session_id, _live(SessionExercise))
        .order_by(SessionExercise.position)
    ).all()
    sets = conn.execute(
        select(WorkoutSet)
        .where(
            WorkoutSet.session_exercise_id.in_([e.id for e in exercises]),
            _live(WorkoutSet),
        )
        .order_by(WorkoutSet.set_index)
    ).all()
    by_exercise: dict[uuid.UUID, list[dict[str, Any]]] = {e.id: [] for e in exercises}
    for row in sets:
        by_exercise[row.session_exercise_id].append(_set_dict(row))
    # Cele z planu: kolejne wystąpienia ćwiczenia w treningu dostają kolejne bloczki dnia.
    targets: dict[uuid.UUID, list[dict[str, Any]]] = {}
    day_name = None
    if s.program_day_id:
        day_name = conn.execute(
            select(ProgramDay.name).where(ProgramDay.id == s.program_day_id)
        ).scalar()
        for block in day_targets(conn, s.program_day_id):
            targets.setdefault(block["exercise_id"], []).append(block)
    return {
        "id": s.id,
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "local_date": s.local_date,
        "bodyweight_kg": s.bodyweight_kg,
        "notes": s.notes,
        "program_day_id": s.program_day_id,
        "day_name": day_name,
        "exercises": [
            {
                **e._asdict(),
                "sets": by_exercise[e.id],
                "target": (targets.get(e.exercise_id) or [None]).pop(0),
            }
            for e in exercises
        ],
    }


def _set_dict(row) -> dict[str, Any]:
    return {
        "id": row.id,
        "session_exercise_id": row.session_exercise_id,
        **{f: getattr(row, f) for f in SET_FIELDS},
        "effective_kg": row.effective_kg,
        "e1rm_kg": row.e1rm_kg,
    }


def _exercise_ids(conn: Connection, session_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        conn.execute(
            select(SessionExercise.exercise_id.distinct()).where(
                SessionExercise.session_id == session_id
            )
        ).scalars()
    )


def update_session(
    conn: Connection, user_id: uuid.UUID, session_id: uuid.UUID, changes: dict[str, Any]
) -> None:
    _session_row(conn, session_id)
    if not changes:
        return
    conn.execute(update(WorkoutSession).where(WorkoutSession.id == session_id).values(**changes))
    # Masa ciała zmienia ciężar ćwiczeń z masą ciała, a więc i rekordy.
    if "bodyweight_kg" in changes:
        for exercise_id in _exercise_ids(conn, session_id):
            refresh_exercise(conn, user_id, exercise_id)


def delete_session(conn: Connection, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
    _session_row(conn, session_id)
    conn.execute(
        update(WorkoutSession).where(WorkoutSession.id == session_id).values(deleted_at=func.now())
    )
    for exercise_id in _exercise_ids(conn, session_id):
        refresh_exercise(conn, user_id, exercise_id)


def add_exercise(
    conn: Connection,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    exercise_id: uuid.UUID,
    session_exercise_id: uuid.UUID | None = None,
) -> uuid.UUID:
    _session_row(conn, session_id)
    if session_exercise_id is not None:
        existing = conn.execute(
            select(SessionExercise.session_id).where(SessionExercise.id == session_exercise_id)
        ).first()
        if existing is not None:
            if existing.session_id != session_id:
                raise NotFound
            return session_exercise_id
    if conn.execute(select(Exercise.id).where(Exercise.id == exercise_id)).first() is None:
        raise NotFound
    position = conn.execute(
        select(func.coalesce(func.max(SessionExercise.position) + 1, 0)).where(
            SessionExercise.session_id == session_id, _live(SessionExercise)
        )
    ).scalar_one()
    session_exercise_id = session_exercise_id or uuid7()
    conn.execute(
        insert(SessionExercise).values(
            id=session_exercise_id,
            user_id=user_id,
            session_id=session_id,
            exercise_id=exercise_id,
            position=position,
        )
    )
    return session_exercise_id


def _session_exercise(conn: Connection, session_exercise_id: uuid.UUID):
    row = conn.execute(
        select(SessionExercise.id, SessionExercise.exercise_id).where(
            SessionExercise.id == session_exercise_id, _live(SessionExercise)
        )
    ).first()
    if row is None:
        raise NotFound
    return row


def remove_exercise(conn: Connection, user_id: uuid.UUID, session_exercise_id: uuid.UUID) -> None:
    se = _session_exercise(conn, session_exercise_id)
    conn.execute(
        update(SessionExercise)
        .where(SessionExercise.id == session_exercise_id)
        .values(deleted_at=func.now())
    )
    refresh_exercise(conn, user_id, se.exercise_id)


def save_set(
    conn: Connection, user_id: uuid.UUID, set_id: uuid.UUID, data: dict[str, Any]
) -> dict[str, Any]:
    """Zapisuje serię (nową albo poprawioną) i zwraca ją z 1RM oraz nowymi rekordami."""
    se = _session_exercise(conn, data["session_exercise_id"])
    existing = conn.execute(
        select(WorkoutSet.session_exercise_id).where(WorkoutSet.id == set_id)
    ).first()
    values = {f: data.get(f) for f in SET_FIELDS if f in data}
    if existing is None:
        conn.execute(
            insert(WorkoutSet).values(
                id=set_id, user_id=user_id, session_exercise_id=se.id, **values
            )
        )
    else:
        if existing.session_exercise_id != se.id:
            raise NotFound
        conn.execute(
            update(WorkoutSet).where(WorkoutSet.id == set_id).values(deleted_at=None, **values)
        )
    refresh_exercise(conn, user_id, se.exercise_id)
    row = conn.execute(select(WorkoutSet).where(WorkoutSet.id == set_id)).one()
    return {**_set_dict(row), "records": set_records(conn, set_id)}


def set_records(conn: Connection, set_id: uuid.UUID) -> list[dict[str, Any]]:
    """Aktualne rekordy ustanowione tą serią. `beat_previous` = pobito wcześniejszy wynik
    (pierwszy w historii wynik to też rekord, ale mniej ekscytujący)."""
    older = aliased(PersonalRecord)
    beat = exists().where(
        older.user_id == PersonalRecord.user_id,
        older.exercise_id == PersonalRecord.exercise_id,
        older.record_type == PersonalRecord.record_type,
        older.reps.is_not_distinct_from(PersonalRecord.reps),
        older.superseded_at.is_not(None),
        older.deleted_at.is_(None),
    )
    rows = conn.execute(
        select(
            PersonalRecord.record_type,
            PersonalRecord.reps,
            PersonalRecord.value,
            beat.label("beat_previous"),
        ).where(
            PersonalRecord.set_id == set_id,
            PersonalRecord.superseded_at.is_(None),
            _live(PersonalRecord),
        )
    ).all()
    return [r._asdict() for r in rows]


def delete_set(conn: Connection, user_id: uuid.UUID, set_id: uuid.UUID) -> None:
    row = conn.execute(
        select(SessionExercise.exercise_id)
        .join(WorkoutSet, WorkoutSet.session_exercise_id == SessionExercise.id)
        .where(WorkoutSet.id == set_id, _live(WorkoutSet))
    ).first()
    if row is None:
        raise NotFound
    conn.execute(update(WorkoutSet).where(WorkoutSet.id == set_id).values(deleted_at=func.now()))
    refresh_exercise(conn, user_id, row.exercise_id)


def last_performance(
    conn: Connection, exercise_id: uuid.UUID, before_session: uuid.UUID | None = None
) -> dict[str, Any] | None:
    """Serie z ostatniego treningu z tym ćwiczeniem (do podpowiedzi „ostatnio”)."""
    q = (
        select(SessionExercise.id, WorkoutSession.local_date)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .where(
            SessionExercise.exercise_id == exercise_id,
            _live(SessionExercise),
            _live(WorkoutSession),
            exists().where(WorkoutSet.session_exercise_id == SessionExercise.id, _live(WorkoutSet)),
        )
        .order_by(WorkoutSession.started_at.desc())
        .limit(1)
    )
    if before_session is not None:
        q = q.where(WorkoutSession.id != before_session)
    last = conn.execute(q).first()
    if last is None:
        return None
    sets = conn.execute(
        select(WorkoutSet)
        .where(WorkoutSet.session_exercise_id == last.id, _live(WorkoutSet))
        .order_by(WorkoutSet.set_index)
    ).all()
    return {"date": last.local_date, "sets": [_set_dict(s) for s in sets]}


def exercise_records(conn: Connection, exercise_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = conn.execute(
        select(
            PersonalRecord.record_type,
            PersonalRecord.reps,
            PersonalRecord.value,
            PersonalRecord.achieved_at,
        )
        .where(
            PersonalRecord.exercise_id == exercise_id,
            PersonalRecord.superseded_at.is_(None),
            _live(PersonalRecord),
        )
        .order_by(PersonalRecord.record_type, PersonalRecord.reps)
    ).all()
    return [r._asdict() for r in rows]


def e1rm_history(conn: Connection, exercise_id: uuid.UUID) -> list[dict[str, Any]]:
    """Najlepszy szacowany 1RM z każdego dnia treningowego."""
    rows = conn.execute(
        select(WorkoutSession.local_date, func.max(WorkoutSet.e1rm_kg).label("e1rm_kg"))
        .join(SessionExercise, SessionExercise.id == WorkoutSet.session_exercise_id)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .where(
            SessionExercise.exercise_id == exercise_id,
            WorkoutSet.e1rm_kg.is_not(None),
            _live(WorkoutSet),
            _live(SessionExercise),
            _live(WorkoutSession),
        )
        .group_by(WorkoutSession.local_date)
        .order_by(WorkoutSession.local_date)
    ).all()
    return [{"date": r.local_date, "e1rm_kg": r.e1rm_kg} for r in rows]


def trained_exercises(conn: Connection) -> list[dict[str, Any]]:
    """Ćwiczenia, które się robiło, z aktualnym szacowanym 1RM (lista na ekranie Postęp)."""
    best = (
        select(PersonalRecord.exercise_id, PersonalRecord.value, PersonalRecord.achieved_at)
        .where(
            PersonalRecord.record_type == "e1rm",
            PersonalRecord.superseded_at.is_(None),
            _live(PersonalRecord),
        )
        .subquery()
    )
    last = (
        select(
            SessionExercise.exercise_id,
            func.max(WorkoutSession.local_date).label("last_date"),
            func.count(func.distinct(WorkoutSession.id)).label("sessions"),
        )
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .where(
            _live(SessionExercise),
            _live(WorkoutSession),
            # Ćwiczenie dodane do treningu, ale pominięte (bez serii), się nie liczy.
            exists().where(WorkoutSet.session_exercise_id == SessionExercise.id, _live(WorkoutSet)),
        )
        .group_by(SessionExercise.exercise_id)
        .subquery()
    )
    rows = conn.execute(
        select(
            Exercise.id,
            Exercise.name,
            Exercise.tracking,
            last.c.last_date,
            last.c.sessions,
            best.c.value.label("e1rm_kg"),
        )
        .join(last, last.c.exercise_id == Exercise.id)
        .outerjoin(best, best.c.exercise_id == Exercise.id)
        .order_by(last.c.last_date.desc(), Exercise.name)
    ).all()
    return [r._asdict() for r in rows]
