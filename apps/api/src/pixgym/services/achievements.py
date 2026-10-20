"""Odznaki, historia awansów rang i przypomnienia o zdjęciach z danych w bazie.

Wywoływać w transakcji użytkownika (RLS). Nic nie jest zapisywane: wynik liczy się
z treningów, rekordów i zdjęć przy każdym wywołaniu.
"""

import bisect
import uuid
from dataclasses import asdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, func, select, union_all

from pixgym.domain.badges import (
    Badge,
    PhotoPair,
    PhotoReminder,
    RankEvent,
    compare_pair,
    evaluate_badges,
    photo_reminders,
    rank_history,
)
from pixgym.domain.ranks import RANKED_LIFTS
from pixgym.domain.volume import is_hard_set, set_tonnage
from pixgym.models import (
    BodyMeasurement,
    Exercise,
    PersonalRecord,
    ProgressPhoto,
    SessionExercise,
    User,
    WorkoutSession,
    WorkoutSet,
)


class _BodyweightTimeline:
    """Masa ciała w danej chwili: ostatnia znana wcześniej, a przed pierwszym pomiarem
    pierwsza znana (lepsze niż brak rangi dla starych rekordów)."""

    def __init__(self, conn: Connection, user_id: uuid.UUID):
        measured = select(BodyMeasurement.measured_at.label("t"), BodyMeasurement.weight_kg).where(
            BodyMeasurement.user_id == user_id,
            BodyMeasurement.deleted_at.is_(None),
            BodyMeasurement.weight_kg.is_not(None),
        )
        sessions = select(WorkoutSession.started_at.label("t"), WorkoutSession.bodyweight_kg).where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.deleted_at.is_(None),
            WorkoutSession.bodyweight_kg.is_not(None),
        )
        rows = sorted(conn.execute(union_all(measured, sessions)).all())
        self._times = [t for t, _ in rows]
        self._kg = [float(kg) for _, kg in rows]

    def at(self, t: datetime) -> float | None:
        if not self._kg:
            return None
        i = bisect.bisect_right(self._times, t)
        return self._kg[max(i - 1, 0)]


def _user(conn: Connection, user_id: uuid.UUID) -> tuple[str | None, ZoneInfo]:
    sex, tz = conn.execute(select(User.sex, User.timezone).where(User.id == user_id)).one()
    return sex, ZoneInfo(tz)


def _local(t: datetime, tz: ZoneInfo) -> str:
    return t.astimezone(tz).date().isoformat()


def rank_timeline(conn: Connection, user_id: uuid.UUID) -> dict[str, list[RankEvent]]:
    """Dla każdego boju rankingowego: kiedy zdobyto kolejne rangi."""
    sex, tz = _user(conn, user_id)
    bodyweight = _BodyweightTimeline(conn, user_id)
    rows = conn.execute(
        select(Exercise.slug, PersonalRecord.value, PersonalRecord.achieved_at)
        .join(Exercise, Exercise.id == PersonalRecord.exercise_id)
        .where(
            PersonalRecord.user_id == user_id,
            PersonalRecord.record_type == "e1rm",
            PersonalRecord.deleted_at.is_(None),
            Exercise.slug.in_(list(RANKED_LIFTS)),
        )
    ).all()
    points: dict[str, list[dict]] = {slug: [] for slug in RANKED_LIFTS}
    for slug, value, achieved_at in rows:
        points[slug].append(
            {
                "date": _local(achieved_at, tz),
                "e1rm_kg": float(value),
                "bodyweight_kg": bodyweight.at(achieved_at),
            }
        )
    return {slug: rank_history(slug, pts, sex) for slug, pts in points.items()}


def _session_summaries(conn: Connection, user_id: uuid.UUID) -> list[dict]:
    rows = conn.execute(
        select(
            WorkoutSession.id,
            WorkoutSession.local_date,
            WorkoutSet.set_type,
            WorkoutSet.rpe,
            WorkoutSet.rir,
            WorkoutSet.effective_kg,
            WorkoutSet.reps,
        )
        .join(SessionExercise, SessionExercise.session_id == WorkoutSession.id)
        .join(WorkoutSet, WorkoutSet.session_exercise_id == SessionExercise.id)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.deleted_at.is_(None),
            SessionExercise.deleted_at.is_(None),
            WorkoutSet.deleted_at.is_(None),
        )
    ).all()
    summaries: dict[uuid.UUID, dict] = {}
    for r in rows:
        s = summaries.setdefault(
            r.id, {"date": r.local_date.isoformat(), "hard_sets": 0.0, "tonnage_kg": 0.0}
        )
        rpe = float(r.rpe) if r.rpe is not None else None
        effective = float(r.effective_kg) if r.effective_kg is not None else None
        if is_hard_set(r.set_type, rpe, r.rir):
            s["hard_sets"] += 1
        s["tonnage_kg"] += set_tonnage(r.set_type, effective, r.reps)
    return list(summaries.values())


def _beaten_records(conn: Connection, user_id: uuid.UUID, tz: ZoneInfo) -> list[dict]:
    """Jeden wpis na serię, która pobiła istniejący rekord (pierwsze rekordy się nie liczą)."""
    order = (
        func.row_number()
        .over(
            partition_by=(
                PersonalRecord.exercise_id,
                PersonalRecord.record_type,
                PersonalRecord.reps,
            ),
            order_by=(PersonalRecord.achieved_at, PersonalRecord.id),
        )
        .label("n")
    )
    ranked = (
        select(PersonalRecord.set_id, PersonalRecord.achieved_at, order)
        .where(PersonalRecord.user_id == user_id, PersonalRecord.deleted_at.is_(None))
        .subquery()
    )
    rows = conn.execute(
        select(ranked.c.set_id, func.min(ranked.c.achieved_at))
        .where(ranked.c.n > 1)
        .group_by(ranked.c.set_id)
    ).all()
    return [{"date": _local(achieved_at, tz)} for _, achieved_at in rows]


def _photos(conn: Connection, user_id: uuid.UUID, tz: ZoneInfo) -> list[dict]:
    rows = conn.execute(
        select(ProgressPhoto.id, ProgressPhoto.pose, ProgressPhoto.taken_at).where(
            ProgressPhoto.user_id == user_id, ProgressPhoto.deleted_at.is_(None)
        )
    ).all()
    return [{"id": str(i), "pose": pose, "date": _local(t, tz)} for i, pose, t in rows]


def user_badges(conn: Connection, user_id: uuid.UUID) -> list[Badge]:
    _, tz = _user(conn, user_id)
    timeline = {
        slug: [asdict(e) for e in events] for slug, events in rank_timeline(conn, user_id).items()
    }
    return evaluate_badges(
        _session_summaries(conn, user_id),
        _beaten_records(conn, user_id, tz),
        timeline,
        _photos(conn, user_id, tz),
    )


def user_photo_reminders(
    conn: Connection, user_id: uuid.UUID, today: date | None = None
) -> list[PhotoReminder]:
    _, tz = _user(conn, user_id)
    today_str = (today or datetime.now(tz).date()).isoformat()
    return photo_reminders(_photos(conn, user_id, tz), today_str)


def compare_photos(
    conn: Connection,
    user_id: uuid.UUID,
    pose: str,
    before: date | None = None,
    after: date | None = None,
) -> PhotoPair | None:
    """Para zdjęć przed/po. Same pliki pobiera się przez services.photos.read_photo."""
    _, tz = _user(conn, user_id)
    return compare_pair(
        _photos(conn, user_id, tz),
        pose,
        before.isoformat() if before else None,
        after.isoformat() if after else None,
    )
