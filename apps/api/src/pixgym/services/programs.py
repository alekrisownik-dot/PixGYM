"""Plany treningowe: dni (np. poniedziałek) złożone z bloczków ćwiczeń.

Każdy zapis planu tworzy nową wersję (program_versions), więc treningi zrobione według
starej wersji dalej wskazują na to, co wtedy było w planie. Szablony (owner NULL) są
tylko do odczytu; żeby je zmienić, kopiuje się je do własnych planów.
Wywoływać w transakcji użytkownika (RLS).
"""

import uuid
from typing import Any

from sqlalchemy import Connection, func, insert, select, update

from pixgym.core.ids import uuid7
from pixgym.models import (
    Exercise,
    Program,
    ProgramDay,
    ProgramExercise,
    ProgramVersion,
    UserSettings,
)
from pixgym.services.errors import NotFound

BLOCK_FIELDS = (
    "exercise_id",
    "target_sets",
    "rep_min",
    "rep_max",
    "target_rpe",
    "rest_s",
    "superset_group",
    "set_scheme",
    "progression_rule_id",
    "notes",
)


class PlanError(ValueError):
    """Błąd do pokazania użytkownikowi."""


def _active_id(conn: Connection, user_id: uuid.UUID) -> uuid.UUID | None:
    return conn.execute(
        select(UserSettings.active_program_id).where(UserSettings.user_id == user_id)
    ).scalar()


def list_programs(conn: Connection, user_id: uuid.UUID) -> list[dict[str, Any]]:
    days = (
        select(ProgramVersion.program_id, func.count(ProgramDay.id).label("days"))
        .join(ProgramDay, ProgramDay.program_version_id == ProgramVersion.id)
        .where(ProgramVersion.is_current)
        .group_by(ProgramVersion.program_id)
        .subquery()
    )
    rows = conn.execute(
        select(
            Program.id,
            Program.name,
            Program.description,
            Program.split,
            Program.is_template,
            (Program.owner_user_id.is_(None)).label("builtin"),
            func.coalesce(days.c.days, 0).label("days"),
            Program.updated_at,
        )
        .outerjoin(days, days.c.program_id == Program.id)
        .where(Program.deleted_at.is_(None))
        .order_by(Program.owner_user_id.is_(None), Program.updated_at.desc())
    ).all()
    active = _active_id(conn, user_id)
    return [{**r._asdict(), "active": r.id == active} for r in rows]


def _current_version(conn: Connection, program_id: uuid.UUID):
    row = conn.execute(
        select(Program, ProgramVersion.id.label("version_id"), ProgramVersion.version_no)
        .join(ProgramVersion, ProgramVersion.program_id == Program.id)
        .where(Program.id == program_id, Program.deleted_at.is_(None), ProgramVersion.is_current)
    ).first()
    if row is None:
        raise NotFound
    return row


def _days(conn: Connection, version_id: uuid.UUID) -> list[dict[str, Any]]:
    days = conn.execute(
        select(ProgramDay)
        .where(ProgramDay.program_version_id == version_id)
        .order_by(ProgramDay.day_index)
    ).all()
    blocks = conn.execute(
        select(ProgramExercise, Exercise.name, Exercise.tracking)
        .join(Exercise, Exercise.id == ProgramExercise.exercise_id)
        .where(ProgramExercise.program_day_id.in_([d.id for d in days]))
        .order_by(ProgramExercise.position)
    ).all()
    by_day: dict[uuid.UUID, list[dict[str, Any]]] = {d.id: [] for d in days}
    for b in blocks:
        by_day[b.program_day_id].append(
            {"id": b.id, "name": b.name, "tracking": b.tracking}
            | {f: getattr(b, f) for f in BLOCK_FIELDS}
        )
    return [
        {
            "id": d.id,
            "day_index": d.day_index,
            "name": d.name,
            "weekdays": sorted(d.weekdays or []),
            "blocks": by_day[d.id],
        }
        for d in days
    ]


def get_program(conn: Connection, user_id: uuid.UUID, program_id: uuid.UUID) -> dict[str, Any]:
    row = _current_version(conn, program_id)
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "split": row.split,
        "builtin": row.owner_user_id is None,
        "version_id": row.version_id,
        "version_no": row.version_no,
        "active": row.id == _active_id(conn, user_id),
        "days": _days(conn, row.version_id),
    }


def _check_exercises(conn: Connection, days: list[dict[str, Any]]) -> None:
    ids = {b["exercise_id"] for d in days for b in d["blocks"]}
    if not ids:
        return
    visible = set(
        conn.execute(
            select(Exercise.id).where(Exercise.id.in_(ids), Exercise.deleted_at.is_(None))
        ).scalars()
    )
    if ids - visible:
        raise PlanError("Plan zawiera ćwiczenie, którego nie ma w katalogu.")


def _write_version(
    conn: Connection, program_id: uuid.UUID, version_no: int, days: list[dict[str, Any]]
) -> uuid.UUID:
    version_id = uuid7()
    conn.execute(
        update(ProgramVersion)
        .where(ProgramVersion.program_id == program_id, ProgramVersion.is_current)
        .values(is_current=False)
    )
    conn.execute(
        insert(ProgramVersion).values(
            id=version_id, program_id=program_id, version_no=version_no, is_current=True
        )
    )
    for day_index, day in enumerate(days):
        day_id = uuid7()
        conn.execute(
            insert(ProgramDay).values(
                id=day_id,
                program_version_id=version_id,
                day_index=day_index,
                name=day["name"].strip(),
                weekdays=sorted(set(day.get("weekdays") or [])),
            )
        )
        if day["blocks"]:
            conn.execute(
                insert(ProgramExercise).values(
                    [
                        {
                            "id": uuid7(),
                            "program_day_id": day_id,
                            "position": position,
                            **{f: block.get(f) for f in BLOCK_FIELDS},
                        }
                        for position, block in enumerate(day["blocks"])
                    ]
                )
            )
    return version_id


def create_program(conn: Connection, user_id: uuid.UUID, data: dict[str, Any]) -> uuid.UUID:
    _check_exercises(conn, data["days"])
    program_id = data.get("id") or uuid7()
    conn.execute(
        insert(Program).values(
            id=program_id,
            owner_user_id=user_id,
            name=data["name"].strip(),
            description=data.get("description"),
            split=data.get("split") or "custom",
            is_template=False,
        )
    )
    _write_version(conn, program_id, 1, data["days"])
    return program_id


def update_program(
    conn: Connection, user_id: uuid.UUID, program_id: uuid.UUID, data: dict[str, Any]
) -> None:
    row = _current_version(conn, program_id)
    if row.owner_user_id != user_id:
        raise NotFound  # szablonu nie zmieniamy, a cudzego planu nie widać
    _check_exercises(conn, data["days"])
    conn.execute(
        update(Program)
        .where(Program.id == program_id)
        .values(name=data["name"].strip(), description=data.get("description"))
    )
    _write_version(conn, program_id, row.version_no + 1, data["days"])


def copy_program(conn: Connection, user_id: uuid.UUID, source_id: uuid.UUID) -> uuid.UUID:
    """Kopia szablonu (albo własnego planu) do własnych planów, z dniami tygodnia."""
    src = get_program(conn, user_id, source_id)
    name = src["name"] if src["builtin"] else f"{src['name']} (kopia)"
    return create_program(
        conn,
        user_id,
        {
            "name": name[:100],
            "description": src["description"],
            "split": src["split"],
            "days": src["days"],
        },
    )


def delete_program(conn: Connection, user_id: uuid.UUID, program_id: uuid.UUID) -> None:
    row = _current_version(conn, program_id)
    if row.owner_user_id != user_id:
        raise NotFound
    conn.execute(update(Program).where(Program.id == program_id).values(deleted_at=func.now()))
    conn.execute(
        update(UserSettings)
        .where(UserSettings.user_id == user_id, UserSettings.active_program_id == program_id)
        .values(active_program_id=None)
    )


def set_active(conn: Connection, user_id: uuid.UUID, program_id: uuid.UUID | None) -> None:
    if program_id is not None:
        row = _current_version(conn, program_id)
        if row.owner_user_id != user_id:
            raise PlanError("Aktywny może być tylko własny plan. Najpierw skopiuj szablon.")
    conn.execute(
        update(UserSettings)
        .where(UserSettings.user_id == user_id)
        .values(active_program_id=program_id)
    )


def day_targets(conn: Connection, program_day_id: uuid.UUID) -> list[dict[str, Any]]:
    """Bloczki dnia planu w kolejności (cele serii do pokazania w treningu)."""
    rows = conn.execute(
        select(ProgramExercise)
        .where(ProgramExercise.program_day_id == program_day_id)
        .order_by(ProgramExercise.position)
    ).all()
    return [{f: getattr(r, f) for f in BLOCK_FIELDS} for r in rows]


def day_version(conn: Connection, program_day_id: uuid.UUID) -> uuid.UUID:
    version = conn.execute(
        select(ProgramDay.program_version_id).where(ProgramDay.id == program_day_id)
    ).scalar()
    if version is None:
        raise NotFound
    return version
