"""Własne ćwiczenia i zdjęcia maszyn. Wywoływać w transakcji użytkownika (RLS)."""

import uuid
from typing import Any

from sqlalchemy import Connection, func, insert, select, update

from pixgym.core.ids import uuid7
from pixgym.models import Equipment, Exercise, ExerciseMuscle, ExercisePhoto, MuscleGroup
from pixgym.services.errors import NotFound
from pixgym.services.photos import PhotoNotFound, PhotoStore, process_image

MAX_PHOTOS_PER_EXERCISE = 10


class CatalogError(ValueError):
    """Błąd do pokazania użytkownikowi."""


def meta(conn: Connection) -> dict[str, list[dict[str, Any]]]:
    """Sprzęt i partie mięśniowe do formularza własnego ćwiczenia."""
    equipment = conn.execute(select(Equipment.slug, Equipment.name).order_by(Equipment.id)).all()
    muscles = conn.execute(
        select(MuscleGroup.slug, MuscleGroup.name).order_by(MuscleGroup.id)
    ).all()
    return {
        "equipment": [r._asdict() for r in equipment],
        "muscles": [r._asdict() for r in muscles],
    }


def _ids(conn: Connection, model, slugs: list[str]) -> dict[str, int]:
    rows = conn.execute(select(model.slug, model.id).where(model.slug.in_(slugs))).all()
    found = dict(rows)
    missing = set(slugs) - set(found)
    if missing:
        raise CatalogError(f"Nieznane: {', '.join(sorted(missing))}")
    return found


def create_exercise(
    conn: Connection,
    user_id: uuid.UUID,
    data: dict[str, Any],
) -> uuid.UUID:
    """Nowe ćwiczenie widoczne tylko dla właściciela. Ponowne wysłanie z tym samym ID
    (kolejka offline) nic nie zmienia."""
    exercise_id = data.get("id") or uuid7()
    if conn.execute(select(Exercise.id).where(Exercise.id == exercise_id)).first():
        return exercise_id
    name = data["name"].strip()
    taken = conn.execute(
        select(Exercise.id).where(
            Exercise.owner_user_id == user_id,
            func.lower(Exercise.name) == name.lower(),
            Exercise.deleted_at.is_(None),
        )
    ).first()
    if taken:
        raise CatalogError("Masz już ćwiczenie o tej nazwie.")
    equipment = _ids(conn, Equipment, [data["equipment"]])
    secondary = [m for m in data.get("secondary_muscles", []) if m != data["primary_muscle"]]
    muscles = _ids(conn, MuscleGroup, [data["primary_muscle"], *secondary])
    conn.execute(
        insert(Exercise).values(
            id=exercise_id,
            owner_user_id=user_id,
            name=name,
            equipment_id=equipment[data["equipment"]],
            tracking=data["tracking"],
            is_unilateral=data.get("is_unilateral", False),
            # Ćwiczenie z masą ciała liczy całą masę (jak podciąganie), da się to poprawić.
            bw_factor=1.0 if data["tracking"] == "bodyweight_reps" else None,
            notes=data.get("notes") or None,
            per_side=bool(data.get("per_side")),
        )
    )
    conn.execute(
        insert(ExerciseMuscle).values(
            [
                {
                    "exercise_id": exercise_id,
                    "muscle_group_id": muscles[data["primary_muscle"]],
                    "role": "primary",
                    "contribution": 1,
                },
                *(
                    {
                        "exercise_id": exercise_id,
                        "muscle_group_id": muscles[m],
                        "role": "secondary",
                        "contribution": 0.5,
                    }
                    for m in secondary
                ),
            ]
        )
    )
    return exercise_id


def _own_exercise(conn: Connection, user_id: uuid.UUID, exercise_id: uuid.UUID) -> None:
    row = conn.execute(
        select(Exercise.id).where(
            Exercise.id == exercise_id,
            Exercise.owner_user_id == user_id,
            Exercise.deleted_at.is_(None),
        )
    ).first()
    if row is None:
        raise NotFound


def update_exercise(
    conn: Connection, user_id: uuid.UUID, exercise_id: uuid.UUID, changes: dict[str, Any]
) -> None:
    _own_exercise(conn, user_id, exercise_id)
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    if changes:
        conn.execute(update(Exercise).where(Exercise.id == exercise_id).values(**changes))


def delete_exercise(conn: Connection, user_id: uuid.UUID, exercise_id: uuid.UUID) -> None:
    """Miękko: stare treningi z tym ćwiczeniem zostają, znika tylko z listy."""
    _own_exercise(conn, user_id, exercise_id)
    conn.execute(update(Exercise).where(Exercise.id == exercise_id).values(deleted_at=func.now()))


def photos_by_exercise(conn: Connection) -> dict[uuid.UUID, list[dict[str, Any]]]:
    rows = conn.execute(
        select(ExercisePhoto.id, ExercisePhoto.exercise_id, ExercisePhoto.caption)
        .where(ExercisePhoto.deleted_at.is_(None))
        .order_by(ExercisePhoto.created_at)
    ).all()
    out: dict[uuid.UUID, list[dict[str, Any]]] = {}
    for r in rows:
        out.setdefault(r.exercise_id, []).append({"id": r.id, "caption": r.caption})
    return out


def add_photo(
    conn: Connection,
    store: PhotoStore,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    data: bytes,
    caption: str | None,
) -> uuid.UUID:
    """Zdjęcie maszyny: bez metadanych (GPS), zmniejszone, zaszyfrowane na dysku."""
    if (
        conn.execute(
            select(Exercise.id).where(Exercise.id == exercise_id, Exercise.deleted_at.is_(None))
        ).first()
        is None
    ):
        raise NotFound
    count = conn.execute(
        select(func.count()).where(
            ExercisePhoto.exercise_id == exercise_id, ExercisePhoto.deleted_at.is_(None)
        )
    ).scalar_one()
    if count >= MAX_PHOTOS_PER_EXERCISE:
        raise CatalogError(f"Najwyżej {MAX_PHOTOS_PER_EXERCISE} zdjęć na ćwiczenie.")
    photo = process_image(data)
    photo_id = uuid7()
    store.write(user_id, photo_id, "full", photo.full)
    store.write(user_id, photo_id, "thumb", photo.thumb)
    try:
        conn.execute(
            insert(ExercisePhoto).values(
                id=photo_id,
                user_id=user_id,
                exercise_id=exercise_id,
                caption=(caption or "").strip()[:80] or None,
                width=photo.width,
                height=photo.height,
            )
        )
    except Exception:
        store.delete(user_id, photo_id)
        raise
    return photo_id


def _photo_owner(conn: Connection, photo_id: uuid.UUID) -> uuid.UUID:
    owner = conn.execute(
        select(ExercisePhoto.user_id).where(
            ExercisePhoto.id == photo_id, ExercisePhoto.deleted_at.is_(None)
        )
    ).scalar()
    if owner is None:
        raise PhotoNotFound(str(photo_id))
    return owner


def read_photo(conn: Connection, store: PhotoStore, photo_id: uuid.UUID, variant) -> bytes:
    return store.read(_photo_owner(conn, photo_id), photo_id, variant)


def delete_photo(conn: Connection, store: PhotoStore, photo_id: uuid.UUID) -> None:
    owner = _photo_owner(conn, photo_id)
    conn.execute(
        update(ExercisePhoto).where(ExercisePhoto.id == photo_id).values(deleted_at=func.now())
    )
    store.delete(owner, photo_id)
