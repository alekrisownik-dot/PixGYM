"""Wydarzenia w kalendarzu (zawody, wyjazdy, badania, odpoczynek) i własne szablony."""

import uuid
from datetime import date

from fastapi import APIRouter, status

from pixgym.api.deps import UserId
from pixgym.api.v1.training import _run
from pixgym.schemas import EventIn, EventOut, EventPatch, EventTemplateIn, EventTemplateOut
from pixgym.services import events

router = APIRouter()


@router.get("/events", response_model=list[EventOut])
async def list_events(start: date, end: date, user_id: UserId) -> list:
    return await _run(user_id, events.list_events, start, end)


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(body: EventIn, user_id: UserId) -> dict:
    def go(conn):
        return events.get_event(conn, events.create_event(conn, user_id, body.model_dump()))

    return await _run(user_id, go)


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: uuid.UUID, body: EventPatch, user_id: UserId) -> dict:
    def go(conn):
        events.update_event(conn, event_id, body.model_dump(exclude_unset=True))
        return events.get_event(conn, event_id)

    return await _run(user_id, go)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: uuid.UUID, user_id: UserId) -> None:
    await _run(user_id, events.delete_event, event_id)


@router.get("/event-templates", response_model=list[EventTemplateOut])
async def list_templates(user_id: UserId) -> list:
    return await _run(user_id, events.list_templates)


@router.post("/event-templates", response_model=EventTemplateOut, status_code=201)
async def create_template(body: EventTemplateIn, user_id: UserId) -> dict:
    def go(conn):
        return events.get_template(conn, events.create_template(conn, user_id, body.model_dump()))

    return await _run(user_id, go)


@router.put("/event-templates/{template_id}", response_model=EventTemplateOut)
async def update_template(template_id: uuid.UUID, body: EventTemplateIn, user_id: UserId) -> dict:
    def go(conn):
        events.update_template(conn, template_id, body.model_dump())
        return events.get_template(conn, template_id)

    return await _run(user_id, go)


@router.delete("/event-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: uuid.UUID, user_id: UserId) -> None:
    await _run(user_id, events.delete_template, template_id)
