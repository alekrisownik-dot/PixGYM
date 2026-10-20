"""Własne ćwiczenia, zdjęcia maszyn i ustawienia treningu."""

import uuid
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select, update

from pixgym.api.deps import UserId, user_tx
from pixgym.api.v1.training import _run
from pixgym.core.config import get_settings
from pixgym.models import UserSettings
from pixgym.schemas import (
    CatalogMetaOut,
    ExerciseIn,
    ExerciseOut,
    ExercisePatch,
    ExercisePhotoOut,
    SettingsIn,
    SettingsOut,
)
from pixgym.services import catalog, training
from pixgym.services.catalog import CatalogError
from pixgym.services.photos import MAX_UPLOAD_BYTES, PhotoError, PhotoNotFound, PhotoStore

router = APIRouter()


@lru_cache
def photo_store() -> PhotoStore:
    settings = get_settings()
    return PhotoStore(settings.photo_dir, settings.photo_key)


async def _catalog(user_id: uuid.UUID, fn, *args):
    try:
        return await _run(user_id, fn, *args)
    except (CatalogError, PhotoError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    except PhotoNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found") from None


def _one(conn, exercise_id: uuid.UUID) -> dict:
    return next(e for e in training.list_exercises(conn) if e["id"] == exercise_id)


@router.get("/catalog/meta", response_model=CatalogMetaOut)
async def catalog_meta(user_id: UserId) -> dict:
    return await _run(user_id, catalog.meta)


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(body: ExerciseIn, user_id: UserId) -> dict:
    def go(conn):
        return _one(conn, catalog.create_exercise(conn, user_id, body.model_dump()))

    return await _catalog(user_id, go)


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
async def update_exercise(exercise_id: uuid.UUID, body: ExercisePatch, user_id: UserId) -> dict:
    def go(conn):
        catalog.update_exercise(conn, user_id, exercise_id, body.model_dump(exclude_unset=True))
        return _one(conn, exercise_id)

    return await _catalog(user_id, go)


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(exercise_id: uuid.UUID, user_id: UserId) -> None:
    await _catalog(user_id, catalog.delete_exercise, user_id, exercise_id)


@router.post(
    "/exercises/{exercise_id}/photos",
    response_model=ExercisePhotoOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_photo(
    exercise_id: uuid.UUID,
    request: Request,
    user_id: UserId,
    caption: str | None = Query(None, max_length=80),
) -> dict:
    """Treść żądania to sam plik (image/jpeg, png, webp), bez formularza."""
    if int(request.headers.get("content-length") or 0) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "too_large")
    data = await request.body()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "too_large")
    photo_id = await _catalog(
        user_id, catalog.add_photo, photo_store(), user_id, exercise_id, data, caption
    )
    return {"id": photo_id, "caption": (caption or "").strip() or None}


@router.get("/exercise-photos/{photo_id}")
async def get_photo(
    photo_id: uuid.UUID, user_id: UserId, variant: Literal["full", "thumb"] = "thumb"
) -> Response:
    data = await _catalog(user_id, catalog.read_photo, photo_store(), photo_id, variant)
    # Plik pod danym ID się nie zmienia: telefon może go trzymać (także offline).
    return Response(
        data,
        media_type="image/jpeg",
        headers={"cache-control": "private, max-age=31536000, immutable"},
    )


@router.delete("/exercise-photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(photo_id: uuid.UUID, user_id: UserId) -> None:
    await _catalog(user_id, catalog.delete_photo, photo_store(), photo_id)


_SETTINGS = (UserSettings.default_rest_s, UserSettings.bar_weight_kg, UserSettings.plate_inventory)


@router.get("/me/settings", response_model=SettingsOut)
async def get_settings_(user_id: UserId):
    async with user_tx(user_id) as conn:
        return (await conn.execute(select(*_SETTINGS).where(UserSettings.user_id == user_id))).one()


@router.patch("/me/settings", response_model=SettingsOut)
async def update_settings(body: SettingsIn, user_id: UserId):
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    inventory = changes.get("plate_inventory")
    if inventory is not None and not all(
        _is_plate(k) and 0 <= v <= 20 for k, v in inventory.items()
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "bad_plates")
    async with user_tx(user_id) as conn:
        if changes:
            await conn.execute(
                update(UserSettings).where(UserSettings.user_id == user_id).values(**changes)
            )
        return (await conn.execute(select(*_SETTINGS).where(UserSettings.user_id == user_id))).one()


def _is_plate(key: str) -> bool:
    try:
        return 0 < float(key) <= 50
    except ValueError:
        return False
