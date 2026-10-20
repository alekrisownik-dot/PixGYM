"""Sylwetka: zgoda, pomiary ciała, zdjęcia postępu (zaszyfrowane), porównanie przed/po."""

import uuid
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from pixgym.api.deps import UserId
from pixgym.api.v1.catalog import photo_store
from pixgym.api.v1.training import _run
from pixgym.schemas import (
    BodyConsentIn,
    BodyOut,
    MeasurementIn,
    MeasurementOut,
    PhotoPairOut,
    ProgressPhotoOut,
)
from pixgym.services import achievements, body, photos
from pixgym.services.body import BodyError
from pixgym.services.photos import MAX_UPLOAD_BYTES, PhotoError, PhotoNotFound

router = APIRouter()

Pose = Literal["front", "side", "back", "other"]


async def _body(user_id: uuid.UUID, fn, *args):
    try:
        return await _run(user_id, fn, *args)
    except (BodyError, PhotoError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    except PhotoNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found") from None


@router.get("/body", response_model=BodyOut)
async def overview(user_id: UserId) -> dict:
    def go(conn):
        return {
            "consent": body.consent_at(conn, user_id) is not None,
            "measurements": body.list_measurements(conn),
            "photos": body.list_photos(conn),
            "reminders": [asdict(r) for r in achievements.user_photo_reminders(conn, user_id)],
        }

    return await _body(user_id, go)


@router.put("/body/consent", status_code=status.HTTP_204_NO_CONTENT)
async def consent(body_in: BodyConsentIn, user_id: UserId) -> None:
    await _body(user_id, body.set_consent, user_id, body_in.consent)


@router.post("/body/measurements", response_model=MeasurementOut, status_code=201)
async def add_measurement(data: MeasurementIn, user_id: UserId) -> dict:
    def go(conn):
        mid = body.add_measurement(conn, user_id, data.model_dump())
        return next(m for m in body.list_measurements(conn) if m["id"] == mid)

    return await _body(user_id, go)


@router.delete("/body/measurements/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_measurement(measurement_id: uuid.UUID, user_id: UserId) -> None:
    await _body(user_id, body.delete_measurement, measurement_id)


@router.post("/body/photos", response_model=ProgressPhotoOut, status_code=201)
async def add_photo(
    request: Request,
    user_id: UserId,
    pose: Pose = "front",
    taken_at: datetime | None = None,
    notes: str | None = Query(None, max_length=200),
) -> dict:
    """Treść żądania to sam plik (image/jpeg, png, webp), bez formularza."""
    if int(request.headers.get("content-length") or 0) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "too_large")
    data = await request.body()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "too_large")
    when = taken_at or datetime.now(UTC)

    def go(conn):
        pid = photos.add_photo(conn, photo_store(), user_id, data, when, pose, notes)
        return next(p for p in body.list_photos(conn) if p["id"] == pid)

    return await _body(user_id, go)


@router.get("/body/photos/{photo_id}")
async def get_photo(
    photo_id: uuid.UUID, user_id: UserId, variant: Literal["full", "thumb"] = "thumb"
) -> Response:
    data = await _body(user_id, photos.read_photo, photo_store(), photo_id, variant)
    # Dane o zdrowiu: telefon nie trzyma kopii (po usunięciu zdjęcie znika wszędzie).
    return Response(data, media_type="image/jpeg", headers={"cache-control": "no-store"})


@router.delete("/body/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(photo_id: uuid.UUID, user_id: UserId) -> None:
    await _body(user_id, photos.delete_photo, photo_store(), photo_id)


@router.get("/body/compare", response_model=PhotoPairOut | None)
async def compare(user_id: UserId, pose: Pose = "front") -> dict | None:
    pair = await _body(user_id, achievements.compare_photos, user_id, pose)
    return asdict(pair) if pair else None
