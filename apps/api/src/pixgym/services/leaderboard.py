"""Rangi użytkownika i ranking znajomych. Wywoływać w transakcji użytkownika (RLS)."""

import uuid
from dataclasses import dataclass
from datetime import UTC
from typing import Literal

from sqlalchemy import Connection, select, text, union_all

from pixgym.domain.ranks import RANKED_LIFTS, Rank, dots, rank_for, rank_positions
from pixgym.models import BodyMeasurement, Exercise, PersonalRecord, User, WorkoutSession

Metric = Literal["kg", "dots"]


@dataclass
class LeaderboardRow:
    position: int
    user_id: uuid.UUID
    display_name: str
    value: float  # kg albo punkty DOTS
    e1rm_kg: float
    title: str | None  # None, gdy brak masy ciała
    is_me: bool


def _exercise_id(conn: Connection, lift_slug: str) -> uuid.UUID:
    if lift_slug not in RANKED_LIFTS:
        raise ValueError(f"Bój {lift_slug!r} nie jest rankingowy")
    return conn.execute(select(Exercise.id).where(Exercise.slug == lift_slug)).scalar_one()


def leaderboard(
    conn: Connection, me: uuid.UUID, lift_slug: str, metric: Metric = "kg"
) -> list[LeaderboardRow]:
    """Ranking osób z włączonym udziałem. Pusty, jeśli pytający sam go nie włączył.

    Masy ciała nie zwracamy: służy tylko do DOTS i rangi.
    """
    exercise_id = _exercise_id(conn, lift_slug)
    rows = conn.execute(
        text(
            "SELECT user_id, display_name, sex, e1rm_kg, achieved_at, bodyweight_kg"
            " FROM leaderboard_entries(:exercise_id)"
        ),
        {"exercise_id": exercise_id},
    ).all()

    by_id = {}
    entries = []
    for r in rows:
        e1rm = float(r.e1rm_kg)
        bodyweight = float(r.bodyweight_kg) if r.bodyweight_kg is not None else None
        value = e1rm if metric == "kg" else dots(e1rm, bodyweight, r.sex)
        rank = rank_for(lift_slug, e1rm, bodyweight, r.sex)
        by_id[str(r.user_id)] = (r, e1rm, rank)
        entries.append(
            {
                "id": str(r.user_id),
                "value": value,
                "achieved_at": r.achieved_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            }
        )

    out = []
    for placed in rank_positions(entries):
        r, e1rm, rank = by_id[placed.id]
        out.append(
            LeaderboardRow(
                position=placed.position,
                user_id=r.user_id,
                display_name=r.display_name,
                value=placed.value,
                e1rm_kg=e1rm,
                title=rank.title if rank else None,
                is_me=r.user_id == me,
            )
        )
    return out


def latest_bodyweight(conn: Connection, user_id: uuid.UUID) -> float | None:
    """Najnowsza masa ciała z pomiarów albo z treningów."""
    measured = select(
        BodyMeasurement.weight_kg.label("kg"), BodyMeasurement.measured_at.label("t")
    ).where(
        BodyMeasurement.user_id == user_id,
        BodyMeasurement.deleted_at.is_(None),
        BodyMeasurement.weight_kg.is_not(None),
    )
    from_sessions = select(
        WorkoutSession.bodyweight_kg.label("kg"), WorkoutSession.started_at.label("t")
    ).where(
        WorkoutSession.user_id == user_id,
        WorkoutSession.deleted_at.is_(None),
        WorkoutSession.bodyweight_kg.is_not(None),
    )
    both = union_all(measured, from_sessions).subquery()
    kg = conn.execute(select(both.c.kg).order_by(both.c.t.desc()).limit(1)).scalar()
    return float(kg) if kg is not None else None


def my_ranks(conn: Connection, user_id: uuid.UUID) -> dict[str, Rank | None]:
    """Moje rangi we wszystkich bojach rankingowych. Nie wymaga udziału w rankingu."""
    sex = conn.execute(select(User.sex).where(User.id == user_id)).scalar()
    bodyweight = latest_bodyweight(conn, user_id)
    best = dict(
        conn.execute(
            select(Exercise.slug, PersonalRecord.value)
            .join(Exercise, Exercise.id == PersonalRecord.exercise_id)
            .where(
                PersonalRecord.user_id == user_id,
                PersonalRecord.record_type == "e1rm",
                PersonalRecord.superseded_at.is_(None),
                PersonalRecord.deleted_at.is_(None),
                Exercise.slug.in_(list(RANKED_LIFTS)),
            )
        ).all()
    )
    return {
        slug: rank_for(slug, float(best[slug]) if slug in best else None, bodyweight, sex)
        for slug in RANKED_LIFTS
    }
