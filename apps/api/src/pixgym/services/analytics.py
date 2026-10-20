"""Kalendarz, objętość tygodniowa i podsumowanie treningu. Transakcja użytkownika (RLS)."""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, and_, func, select
from sqlalchemy.orm import aliased

from pixgym.domain.volume import VolumeSet, muscle_volume, set_tonnage, week_start
from pixgym.models import (
    Exercise,
    ExerciseMuscle,
    MuscleGroup,
    PersonalRecord,
    SessionExercise,
    User,
    WorkoutSession,
    WorkoutSet,
)
from pixgym.services.errors import NotFound


def _live(model):
    return model.deleted_at.is_(None)


def _f(x) -> float | None:
    return float(x) if x is not None else None


def today(conn: Connection, user_id: uuid.UUID) -> date:
    tz = conn.execute(select(User.timezone).where(User.id == user_id)).scalar_one()
    return datetime.now(ZoneInfo(tz)).date()


def week_streak(dates: set[date], today_: date) -> int:
    """Tygodnie z rzędu z co najmniej jednym treningiem. Bieżący tydzień bez treningu
    jeszcze nie przerywa serii (tydzień się nie skończył)."""
    weeks = {week_start(d) for d in dates}
    week = week_start(today_)
    if week not in weeks:
        week -= timedelta(days=7)
    streak = 0
    while week in weeks:
        streak += 1
        week -= timedelta(days=7)
    return streak


def calendar(conn: Connection, user_id: uuid.UUID, start: date, end: date) -> dict[str, Any]:
    working = and_(WorkoutSet.set_type != "warmup", _live(WorkoutSet), _live(SessionExercise))
    per_session = (
        select(
            WorkoutSession.id,
            WorkoutSession.local_date,
            func.count(WorkoutSet.id).filter(working).label("sets"),
            func.coalesce(
                func.sum(WorkoutSet.effective_kg * WorkoutSet.reps).filter(working), 0
            ).label("tonnage"),
        )
        .outerjoin(SessionExercise, SessionExercise.session_id == WorkoutSession.id)
        .outerjoin(WorkoutSet, WorkoutSet.session_exercise_id == SessionExercise.id)
        .where(
            WorkoutSession.user_id == user_id,
            _live(WorkoutSession),
            WorkoutSession.local_date.between(start, end),
        )
        .group_by(WorkoutSession.id)
        .subquery()
    )
    days = conn.execute(
        select(
            per_session.c.local_date,
            func.count().label("sessions"),
            func.sum(per_session.c.sets).label("sets"),
            func.sum(per_session.c.tonnage).label("tonnage_kg"),
        )
        .group_by(per_session.c.local_date)
        .order_by(per_session.c.local_date)
    ).all()
    all_dates = set(
        conn.execute(
            select(WorkoutSession.local_date.distinct()).where(
                WorkoutSession.user_id == user_id, _live(WorkoutSession)
            )
        ).scalars()
    )
    return {
        "days": [
            {
                "date": d.local_date,
                "sessions": d.sessions,
                "sets": int(d.sets or 0),
                "tonnage_kg": float(d.tonnage_kg or 0),
            }
            for d in days
        ],
        "week_streak": week_streak(all_dates, today(conn, user_id)),
        "total_days": len(all_dates),
    }


def weekly_volume(conn: Connection, user_id: uuid.UUID, week: date) -> list[dict[str, Any]]:
    """Ciężkie serie i tonaż na partię mięśniową w tygodniu zaczynającym się od `week`."""
    start = week_start(week)
    rows = conn.execute(
        select(
            WorkoutSet.id,
            WorkoutSet.set_type,
            WorkoutSet.reps,
            WorkoutSet.effective_kg,
            WorkoutSet.rpe,
            WorkoutSet.rir,
            MuscleGroup.slug,
            ExerciseMuscle.contribution,
        )
        .join(SessionExercise, SessionExercise.id == WorkoutSet.session_exercise_id)
        .join(WorkoutSession, WorkoutSession.id == SessionExercise.session_id)
        .join(ExerciseMuscle, ExerciseMuscle.exercise_id == SessionExercise.exercise_id)
        .join(MuscleGroup, MuscleGroup.id == ExerciseMuscle.muscle_group_id)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.local_date >= start,
            WorkoutSession.local_date < start + timedelta(days=7),
            _live(WorkoutSession),
            _live(SessionExercise),
            _live(WorkoutSet),
        )
    ).all()
    sets: dict[uuid.UUID, dict[str, Any]] = {}
    for r in rows:
        s = sets.setdefault(
            r.id,
            {
                "set_type": r.set_type,
                "reps": r.reps,
                "effective_kg": _f(r.effective_kg),
                "rpe": _f(r.rpe),
                "rir": r.rir,
                "muscles": [],
            },
        )
        s["muscles"].append((r.slug, float(r.contribution)))
    volume = muscle_volume(
        VolumeSet(**{**s, "muscles": tuple(s["muscles"])}) for s in sets.values()
    )
    names = dict(conn.execute(select(MuscleGroup.slug, MuscleGroup.name)).all())
    out = [
        {"muscle": slug, "name": names[slug], "hard_sets": v.hard_sets, "tonnage_kg": v.tonnage_kg}
        for slug, v in volume.items()
        if v.hard_sets > 0
    ]
    return sorted(out, key=lambda x: -x["hard_sets"])


def session_summary(conn: Connection, user_id: uuid.UUID, session_id: uuid.UUID) -> dict[str, Any]:
    s = conn.execute(
        select(WorkoutSession).where(WorkoutSession.id == session_id, _live(WorkoutSession))
    ).first()
    if s is None:
        raise NotFound
    rows = conn.execute(
        select(
            SessionExercise.id.label("se_id"),
            SessionExercise.position,
            Exercise.id.label("exercise_id"),
            Exercise.name,
            WorkoutSet.id,
            WorkoutSet.set_type,
            WorkoutSet.weight_kg,
            WorkoutSet.added_kg,
            WorkoutSet.reps,
            WorkoutSet.effective_kg,
            WorkoutSet.e1rm_kg,
        )
        .join(Exercise, Exercise.id == SessionExercise.exercise_id)
        .join(WorkoutSet, WorkoutSet.session_exercise_id == SessionExercise.id)
        .where(SessionExercise.session_id == session_id, _live(SessionExercise), _live(WorkoutSet))
        .order_by(SessionExercise.position, WorkoutSet.set_index)
    ).all()

    exercises: dict[uuid.UUID, dict[str, Any]] = {}
    total_sets = total_reps = 0
    tonnage = 0.0
    for r in rows:
        e = exercises.setdefault(
            r.se_id,
            {
                "exercise_id": r.exercise_id,
                "name": r.name,
                "sets": 0,
                "tonnage_kg": 0.0,
                "best_e1rm_kg": None,
            },
        )
        if r.set_type == "warmup":
            continue
        t = set_tonnage(r.set_type, _f(r.effective_kg), r.reps)
        e["sets"] += 1
        e["tonnage_kg"] += t
        if r.e1rm_kg is not None and (e["best_e1rm_kg"] or 0) < float(r.e1rm_kg):
            e["best_e1rm_kg"] = float(r.e1rm_kg)
        total_sets += 1
        total_reps += r.reps or 0
        tonnage += t

    # Rekordy z tego treningu, które pobiły wynik sprzed niego (najlepszy na koniec treningu).
    older = aliased(PersonalRecord)
    beat = (
        select(older.id)
        .where(
            older.exercise_id == PersonalRecord.exercise_id,
            older.record_type == PersonalRecord.record_type,
            older.reps.is_not_distinct_from(PersonalRecord.reps),
            older.achieved_at < s.started_at,
            older.deleted_at.is_(None),
        )
        .exists()
    )
    records = conn.execute(
        select(
            Exercise.name,
            PersonalRecord.record_type,
            PersonalRecord.reps,
            func.max(PersonalRecord.value).label("value"),
        )
        .join(Exercise, Exercise.id == PersonalRecord.exercise_id)
        .where(
            PersonalRecord.set_id.in_([r.id for r in rows]),
            _live(PersonalRecord),
            beat,
        )
        .group_by(Exercise.name, PersonalRecord.record_type, PersonalRecord.reps)
        .order_by(Exercise.name)
    ).all()

    previous = conn.execute(
        select(WorkoutSession.id, WorkoutSession.local_date)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.started_at < s.started_at,
            _live(WorkoutSession),
        )
        .order_by(WorkoutSession.started_at.desc())
        .limit(1)
    ).first()
    previous_tonnage = None
    if previous is not None:
        previous_tonnage = float(
            conn.execute(
                select(func.coalesce(func.sum(WorkoutSet.effective_kg * WorkoutSet.reps), 0))
                .join(SessionExercise, SessionExercise.id == WorkoutSet.session_exercise_id)
                .where(
                    SessionExercise.session_id == previous.id,
                    WorkoutSet.set_type != "warmup",
                    _live(WorkoutSet),
                    _live(SessionExercise),
                )
            ).scalar_one()
        )

    end = s.ended_at or datetime.now(UTC)
    return {
        "id": s.id,
        "local_date": s.local_date,
        "duration_s": max(0, int((end - s.started_at).total_seconds())),
        "sets": total_sets,
        "reps": total_reps,
        "tonnage_kg": round(tonnage, 2),
        "exercises": [{**e, "tonnage_kg": round(e["tonnage_kg"], 2)} for e in exercises.values()],
        "records": [r._asdict() for r in records],
        "previous_date": previous.local_date if previous else None,
        "previous_tonnage_kg": previous_tonnage,
    }
