"""Katalog ćwiczeń, treningi i serie. Cudzy lub nieistniejący zasób zwraca 404."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError

from pixgym.api.deps import UserId, user_tx
from pixgym.schemas import (
    ExerciseOut,
    LastPerformanceOut,
    SavedSetOut,
    SessionExerciseIn,
    SessionIn,
    SessionListItem,
    SessionOut,
    SessionPatch,
    SetIn,
)
from pixgym.services import training
from pixgym.services.training import NotFound

router = APIRouter()


async def _run(user_id: uuid.UUID, fn, *args):
    """Wywołuje funkcję serwisu w transakcji użytkownika."""
    try:
        async with user_tx(user_id) as conn:
            return await conn.run_sync(fn, *args)
    except NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found") from None
    except IntegrityError:
        # Np. ID już zajęte (także przez cudzy rekord, którego nie widać).
        raise HTTPException(status.HTTP_409_CONFLICT, "conflict") from None


@router.get("/exercises", response_model=list[ExerciseOut])
async def exercises(user_id: UserId) -> list:
    return await _run(user_id, training.list_exercises)


@router.get("/exercises/{exercise_id}/last", response_model=LastPerformanceOut | None)
async def last_performance(
    exercise_id: uuid.UUID, user_id: UserId, before_session: uuid.UUID | None = None
):
    return await _run(user_id, training.last_performance, exercise_id, before_session)


@router.get("/sessions", response_model=list[SessionListItem])
async def sessions(user_id: UserId, limit: int = Query(30, ge=1, le=200)) -> list:
    return await _run(user_id, training.list_sessions, user_id, limit)


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def start_session(body: SessionIn, user_id: UserId) -> dict:
    def go(conn):
        sid = training.start_session(conn, user_id, body.id, body.started_at, body.bodyweight_kg)
        return training.get_session(conn, sid)

    return await _run(user_id, go)


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: uuid.UUID, user_id: UserId) -> dict:
    return await _run(user_id, training.get_session, session_id)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def update_session(session_id: uuid.UUID, body: SessionPatch, user_id: UserId) -> dict:
    def go(conn):
        training.update_session(conn, user_id, session_id, body.model_dump(exclude_unset=True))
        return training.get_session(conn, session_id)

    return await _run(user_id, go)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: uuid.UUID, user_id: UserId) -> None:
    await _run(user_id, training.delete_session, user_id, session_id)


@router.post(
    "/sessions/{session_id}/exercises",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_exercise(session_id: uuid.UUID, body: SessionExerciseIn, user_id: UserId) -> dict:
    def go(conn):
        training.add_exercise(conn, user_id, session_id, body.exercise_id, body.id)
        return training.get_session(conn, session_id)

    return await _run(user_id, go)


@router.delete("/session-exercises/{session_exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_exercise(session_exercise_id: uuid.UUID, user_id: UserId) -> None:
    await _run(user_id, training.remove_exercise, user_id, session_exercise_id)


@router.put("/sets/{set_id}", response_model=SavedSetOut)
async def save_set(set_id: uuid.UUID, body: SetIn, user_id: UserId) -> dict:
    return await _run(user_id, training.save_set, user_id, set_id, body.model_dump())


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_set(set_id: uuid.UUID, user_id: UserId) -> None:
    await _run(user_id, training.delete_set, user_id, set_id)
