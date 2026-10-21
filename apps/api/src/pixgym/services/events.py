"""Wydarzenia w kalendarzu. Wywoływać w transakcji użytkownika (RLS)."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import Connection, delete, insert, select, update

from pixgym.core.ids import uuid7
from pixgym.models import CalendarEvent, EventTemplate
from pixgym.services.errors import NotFound

FIELDS = ("date", "title", "kind", "note", "icon", "remind")


def _out(e) -> dict[str, Any]:
    return {"id": e.id, **{f: getattr(e, f) for f in FIELDS}}


def list_events(conn: Connection, start: date, end: date) -> list[dict[str, Any]]:
    rows = conn.execute(
        select(CalendarEvent)
        .where(CalendarEvent.date >= start, CalendarEvent.date <= end)
        .order_by(CalendarEvent.date, CalendarEvent.created_at)
    ).all()
    return [_out(e) for e in rows]


def get_event(conn: Connection, event_id: uuid.UUID) -> dict[str, Any]:
    e = conn.execute(select(CalendarEvent).where(CalendarEvent.id == event_id)).first()
    if e is None:
        raise NotFound
    return _out(e)


def create_event(conn: Connection, user_id: uuid.UUID, data: dict[str, Any]) -> uuid.UUID:
    """Ponowne wysłanie z tym samym ID (kolejka offline) nic nie zmienia."""
    event_id = data.get("id") or uuid7()
    if conn.execute(select(CalendarEvent.id).where(CalendarEvent.id == event_id)).first():
        return event_id
    conn.execute(
        insert(CalendarEvent).values(
            id=event_id,
            user_id=user_id,
            date=data["date"],
            title=data["title"].strip(),
            kind=data.get("kind") or "event",
            note=(data.get("note") or "").strip() or None,
            icon=(data.get("icon") or "").strip() or None,
            remind=data.get("remind", True),
        )
    )
    return event_id


def update_event(conn: Connection, event_id: uuid.UUID, changes: dict[str, Any]) -> None:
    get_event(conn, event_id)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
    for f in ("note", "icon"):
        if f in changes:
            changes[f] = (changes[f] or "").strip() or None
    if changes.get("remind") is None:
        changes.pop("remind", None)
    if changes:
        conn.execute(update(CalendarEvent).where(CalendarEvent.id == event_id).values(**changes))


def delete_event(conn: Connection, event_id: uuid.UUID) -> None:
    conn.execute(delete(CalendarEvent).where(CalendarEvent.id == event_id))


# --- szablony ---

TEMPLATE_FIELDS = ("title", "icon", "kind", "note", "remind")


def _clean(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": data["title"].strip(),
        "icon": (data.get("icon") or "").strip() or None,
        "kind": data.get("kind") or "event",
        "note": (data.get("note") or "").strip() or None,
        "remind": data.get("remind", True),
    }


def list_templates(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(select(EventTemplate).order_by(EventTemplate.created_at)).all()
    return [{"id": t.id, **{f: getattr(t, f) for f in TEMPLATE_FIELDS}} for t in rows]


def get_template(conn: Connection, template_id: uuid.UUID) -> dict[str, Any]:
    t = conn.execute(select(EventTemplate).where(EventTemplate.id == template_id)).first()
    if t is None:
        raise NotFound
    return {"id": t.id, **{f: getattr(t, f) for f in TEMPLATE_FIELDS}}


def create_template(conn: Connection, user_id: uuid.UUID, data: dict[str, Any]) -> uuid.UUID:
    template_id = uuid7()
    conn.execute(insert(EventTemplate).values(id=template_id, user_id=user_id, **_clean(data)))
    return template_id


def update_template(conn: Connection, template_id: uuid.UUID, data: dict[str, Any]) -> None:
    get_template(conn, template_id)
    conn.execute(
        update(EventTemplate).where(EventTemplate.id == template_id).values(**_clean(data))
    )


def delete_template(conn: Connection, template_id: uuid.UUID) -> None:
    conn.execute(delete(EventTemplate).where(EventTemplate.id == template_id))
