"""Postęp: rekordy, wykres 1RM, rangi, ranking znajomych, odznaki."""

import uuid
from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, HTTPException, status

from pixgym.api.deps import UserId, user_tx
from pixgym.domain.ranks import RANKED_LIFTS
from pixgym.schemas import (
    BadgeOut,
    E1rmPoint,
    ExerciseRecordOut,
    LeaderboardRowOut,
    RankOut,
    TrainedExerciseOut,
)
from pixgym.services import achievements, leaderboard, training

router = APIRouter()


@router.get("/progress/exercises", response_model=list[TrainedExerciseOut])
async def trained_exercises(user_id: UserId) -> list:
    async with user_tx(user_id) as conn:
        return await conn.run_sync(training.trained_exercises)


@router.get("/exercises/{exercise_id}/records", response_model=list[ExerciseRecordOut])
async def exercise_records(exercise_id: uuid.UUID, user_id: UserId) -> list:
    async with user_tx(user_id) as conn:
        return await conn.run_sync(training.exercise_records, exercise_id)


@router.get("/exercises/{exercise_id}/e1rm", response_model=list[E1rmPoint])
async def e1rm_history(exercise_id: uuid.UUID, user_id: UserId) -> list:
    async with user_tx(user_id) as conn:
        return await conn.run_sync(training.e1rm_history, exercise_id)


@router.get("/ranks", response_model=list[RankOut])
async def ranks(user_id: UserId) -> list[RankOut]:
    async with user_tx(user_id) as conn:
        mine = await conn.run_sync(leaderboard.my_ranks, user_id)
    out = []
    for slug, rank in mine.items():
        fields = asdict(rank) if rank else {}
        out.append(
            RankOut(
                lift=slug,
                name=RANKED_LIFTS[slug].name,
                **{
                    k: fields.get(k)
                    for k in ("tier", "title", "ratio", "next_title", "next_at_kg", "progress")
                },
            )
        )
    return out


@router.get("/leaderboard/{lift}", response_model=list[LeaderboardRowOut])
async def leaderboard_rows(
    lift: str, user_id: UserId, metric: Literal["kg", "dots"] = "kg"
) -> list:
    if lift not in RANKED_LIFTS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    async with user_tx(user_id) as conn:
        rows = await conn.run_sync(leaderboard.leaderboard, user_id, lift, metric)
    return [asdict(r) for r in rows]


@router.get("/badges", response_model=list[BadgeOut])
async def badges(user_id: UserId) -> list:
    async with user_tx(user_id) as conn:
        rows = await conn.run_sync(achievements.user_badges, user_id)
    return [asdict(b) for b in rows]
