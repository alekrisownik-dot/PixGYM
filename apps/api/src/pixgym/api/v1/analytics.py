"""Kalendarz, objętość tygodniowa, podsumowanie treningu."""

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, status

from pixgym.api.deps import UserId
from pixgym.api.v1.training import _run
from pixgym.schemas import CalendarOut, MuscleVolumeOut, SessionSummaryOut
from pixgym.services import analytics

router = APIRouter()

MAX_CALENDAR_DAYS = 400


@router.get("/calendar", response_model=CalendarOut)
async def calendar(user_id: UserId, start: date, end: date) -> dict:
    if not 0 <= (end - start).days <= MAX_CALENDAR_DAYS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "bad_range")
    return await _run(user_id, analytics.calendar, user_id, start, end)


@router.get("/volume", response_model=list[MuscleVolumeOut])
async def volume(user_id: UserId, week: date | None = None) -> list:
    def go(conn):
        return analytics.weekly_volume(conn, user_id, week or analytics.today(conn, user_id))

    return await _run(user_id, go)


@router.get("/sessions/{session_id}/summary", response_model=SessionSummaryOut)
async def summary(session_id: uuid.UUID, user_id: UserId) -> dict:
    return await _run(user_id, analytics.session_summary, user_id, session_id)
