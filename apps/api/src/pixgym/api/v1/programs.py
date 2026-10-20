"""Plany treningowe: lista, szczegóły, zapis bloczków, kopia szablonu, aktywny plan."""

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, status

from pixgym.api.deps import UserId
from pixgym.api.v1.training import _run
from pixgym.schemas import ActivePlanIn, PlanIn, PlanListItem, PlanOut, PlanProgressOut
from pixgym.services import programs
from pixgym.services.programs import PlanError

router = APIRouter()


async def _plans(user_id: uuid.UUID, fn, *args):
    try:
        return await _run(user_id, fn, *args)
    except PlanError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None


@router.get("/programs", response_model=list[PlanListItem])
async def list_programs(user_id: UserId) -> list:
    return await _plans(user_id, programs.list_programs, user_id)


@router.get("/programs/{program_id}", response_model=PlanOut)
async def get_program(program_id: uuid.UUID, user_id: UserId) -> dict:
    return await _plans(user_id, programs.get_program, user_id, program_id)


@router.get("/programs/{program_id}/progress", response_model=PlanProgressOut)
async def plan_progress(program_id: uuid.UUID, start: date, user_id: UserId) -> dict:
    return await _plans(user_id, programs.plan_progress, user_id, program_id, start)


@router.post("/programs", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_program(body: PlanIn, user_id: UserId) -> dict:
    def go(conn):
        pid = programs.create_program(conn, user_id, body.model_dump())
        return programs.get_program(conn, user_id, pid)

    return await _plans(user_id, go)


@router.put("/programs/{program_id}", response_model=PlanOut)
async def update_program(program_id: uuid.UUID, body: PlanIn, user_id: UserId) -> dict:
    def go(conn):
        programs.update_program(conn, user_id, program_id, body.model_dump())
        return programs.get_program(conn, user_id, program_id)

    return await _plans(user_id, go)


@router.post("/programs/{program_id}/copy", response_model=PlanOut, status_code=201)
async def copy_program(program_id: uuid.UUID, user_id: UserId) -> dict:
    def go(conn):
        pid = programs.copy_program(conn, user_id, program_id)
        return programs.get_program(conn, user_id, pid)

    return await _plans(user_id, go)


@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program(program_id: uuid.UUID, user_id: UserId) -> None:
    await _plans(user_id, programs.delete_program, user_id, program_id)


@router.put("/me/active-program", status_code=status.HTTP_204_NO_CONTENT)
async def set_active(body: ActivePlanIn, user_id: UserId) -> None:
    await _plans(user_id, programs.set_active, user_id, body.program_id)
