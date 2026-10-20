"""Moduł sylwetki: zgoda, pomiary ciała i lista zdjęć postępu.

Pliki zdjęć zapisuje i szyfruje services.photos; porównanie i przypomnienia liczy
services.achievements. Wywoływać w transakcji użytkownika (RLS).
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Connection, func, insert, select, update

from pixgym.core.ids import uuid7
from pixgym.models import BodyMeasurement, ProgressPhoto, UserSettings
from pixgym.services.errors import NotFound

FIELDS = ("weight_kg", "body_fat_pct", "waist_cm", "chest_cm", "arm_cm", "thigh_cm", "hip_cm")


class BodyError(ValueError):
    """Błąd do pokazania użytkownikowi."""


def consent_at(conn: Connection, user_id: uuid.UUID) -> datetime | None:
    return conn.execute(
        select(UserSettings.body_consent_at).where(UserSettings.user_id == user_id)
    ).scalar()


def set_consent(conn: Connection, user_id: uuid.UUID, consent: bool) -> None:
    conn.execute(
        update(UserSettings)
        .where(UserSettings.user_id == user_id)
        .values(body_consent_at=func.now() if consent else None)
    )


def _require_consent(conn: Connection, user_id: uuid.UUID) -> None:
    if consent_at(conn, user_id) is None:
        raise BodyError("Moduł sylwetki wymaga zgody w ustawieniach (dane o zdrowiu).")


def list_measurements(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        select(BodyMeasurement)
        .where(BodyMeasurement.deleted_at.is_(None))
        .order_by(BodyMeasurement.measured_at.desc())
    ).all()
    return [
        {
            "id": r.id,
            "measured_at": r.measured_at,
            "notes": r.notes,
            **{f: getattr(r, f) for f in FIELDS},
        }
        for r in rows
    ]


def add_measurement(conn: Connection, user_id: uuid.UUID, data: dict[str, Any]) -> uuid.UUID:
    """Ponowne wysłanie z tym samym ID (kolejka offline) nic nie zmienia."""
    _require_consent(conn, user_id)
    if all(data.get(f) is None for f in FIELDS):
        raise BodyError("Podaj przynajmniej jeden pomiar.")
    mid = data.get("id") or uuid7()
    if conn.execute(select(BodyMeasurement.id).where(BodyMeasurement.id == mid)).first():
        return mid
    conn.execute(
        insert(BodyMeasurement).values(
            id=mid,
            user_id=user_id,
            measured_at=data.get("measured_at") or datetime.now(UTC),
            notes=(data.get("notes") or "").strip() or None,
            **{f: data.get(f) for f in FIELDS},
        )
    )
    return mid


def delete_measurement(conn: Connection, measurement_id: uuid.UUID) -> None:
    done = conn.execute(
        update(BodyMeasurement)
        .where(BodyMeasurement.id == measurement_id, BodyMeasurement.deleted_at.is_(None))
        .values(deleted_at=func.now())
    )
    if not done.rowcount:
        raise NotFound


def list_photos(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        select(ProgressPhoto.id, ProgressPhoto.pose, ProgressPhoto.taken_at, ProgressPhoto.notes)
        .where(ProgressPhoto.deleted_at.is_(None))
        .order_by(ProgressPhoto.taken_at.desc())
    ).all()
    return [r._asdict() for r in rows]
