"""Zdjęcia postępu: obróbka, szyfrowany zapis na dysku i rekord w bazie.

Telefon zapisuje w zdjęciu m.in. lokalizację GPS, więc zdjęcie jest dekodowane i zapisywane
od nowa bez metadanych. Pliki są szyfrowane AES-256-GCM; dane powiązane (AAD) zawierają
użytkownika i ID zdjęcia, więc podmiana pliku między kontami nie przejdzie odszyfrowania.
"""

import base64
import io
import os
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import Connection, func, insert, select, update

from pixgym.core.ids import uuid7
from pixgym.models import ProgressPhoto, UserSettings

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 50_000_000  # ochrona przed „bombą dekompresyjną”
MAX_SIDE = 2048
THUMB_SIDE = 400
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

Variant = Literal["full", "thumb"]


class PhotoError(ValueError):
    """Błąd do pokazania użytkownikowi (zły plik, brak zgody)."""


class PhotoNotFound(LookupError):
    pass


@dataclass
class ProcessedPhoto:
    full: bytes
    thumb: bytes
    width: int
    height: int


def _jpeg(img: Image.Image, side: int) -> tuple[bytes, Image.Image]:
    copy = img.copy()
    copy.thumbnail((side, side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    # Bez exif= i icc_profile= Pillow nie zapisuje żadnych metadanych.
    copy.save(buf, "JPEG", quality=85, optimize=True)
    return buf.getvalue(), copy


def process_image(data: bytes) -> ProcessedPhoto:
    """Sprawdza, obraca według EXIF, zmniejsza i zapisuje bez metadanych."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise PhotoError("Zdjęcie jest za duże (limit 20 MB).")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise PhotoError("Obsługiwane formaty: JPEG, PNG, WebP.")
            if probe.width * probe.height > MAX_PIXELS:
                raise PhotoError("Zdjęcie ma za dużą rozdzielczość.")
            probe.load()
            img = ImageOps.exif_transpose(probe).convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
        raise PhotoError("To nie jest poprawne zdjęcie.") from e
    full, resized = _jpeg(img, MAX_SIDE)
    thumb, _ = _jpeg(img, THUMB_SIDE)
    return ProcessedPhoto(full, thumb, resized.width, resized.height)


class PhotoStore:
    """Zaszyfrowane pliki: <root>/<user_id>/<photo_id>.<wariant>.enc"""

    def __init__(self, root: str | Path, key_b64: str | None):
        if not key_b64:
            raise RuntimeError("Brak PIXGYM_PHOTO_KEY: zdjęcia nie mogą być zapisane.")
        key = base64.b64decode(key_b64)
        if len(key) != 32:
            raise RuntimeError("PIXGYM_PHOTO_KEY musi mieć 32 bajty (base64).")
        self.root = Path(root)
        self._aes = AESGCM(key)

    def _path(self, user_id: uuid.UUID, photo_id: uuid.UUID, variant: Variant) -> Path:
        return self.root / str(user_id) / f"{photo_id}.{variant}.enc"

    @staticmethod
    def _aad(user_id: uuid.UUID, photo_id: uuid.UUID, variant: Variant) -> bytes:
        return f"{user_id}/{photo_id}/{variant}".encode()

    def write(self, user_id: uuid.UUID, photo_id: uuid.UUID, variant: Variant, data: bytes):
        path = self._path(user_id, photo_id, variant)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        nonce = os.urandom(12)
        blob = nonce + self._aes.encrypt(nonce, data, self._aad(user_id, photo_id, variant))
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(blob)
        tmp.replace(path)  # atomowo: nigdy pół pliku

    def read(self, user_id: uuid.UUID, photo_id: uuid.UUID, variant: Variant) -> bytes:
        try:
            blob = self._path(user_id, photo_id, variant).read_bytes()
            return self._aes.decrypt(blob[:12], blob[12:], self._aad(user_id, photo_id, variant))
        except (FileNotFoundError, InvalidTag) as e:
            raise PhotoNotFound(str(photo_id)) from e

    def delete(self, user_id: uuid.UUID, photo_id: uuid.UUID) -> None:
        for variant in ("full", "thumb"):
            self._path(user_id, photo_id, variant).unlink(missing_ok=True)

    def purge_user(self, user_id: uuid.UUID) -> None:
        """Usuwa wszystkie pliki użytkownika (usunięcie konta, etap 7)."""
        shutil.rmtree(self.root / str(user_id), ignore_errors=True)


def add_photo(
    conn: Connection,
    store: PhotoStore,
    user_id: uuid.UUID,
    data: bytes,
    taken_at: datetime,
    pose: str = "front",
    notes: str | None = None,
) -> uuid.UUID:
    """Zapisuje zdjęcie. Wymaga zgody na moduł sylwetki (dane o zdrowiu)."""
    consent = conn.execute(
        select(UserSettings.body_consent_at).where(UserSettings.user_id == user_id)
    ).scalar()
    if consent is None:
        raise PhotoError("Zdjęcia sylwetki wymagają zgody w ustawieniach (dane o zdrowiu).")
    photo = process_image(data)
    photo_id = uuid7()
    store.write(user_id, photo_id, "full", photo.full)
    store.write(user_id, photo_id, "thumb", photo.thumb)
    try:
        conn.execute(
            insert(ProgressPhoto).values(
                id=photo_id,
                user_id=user_id,
                taken_at=taken_at,
                pose=pose,
                width=photo.width,
                height=photo.height,
                size_bytes=len(photo.full),
                notes=notes,
            )
        )
    except Exception:
        store.delete(user_id, photo_id)
        raise
    return photo_id


def _owned_photo(conn: Connection, photo_id: uuid.UUID) -> uuid.UUID:
    # RLS: cudze zdjęcie wygląda dokładnie jak nieistniejące.
    owner = conn.execute(
        select(ProgressPhoto.user_id).where(
            ProgressPhoto.id == photo_id, ProgressPhoto.deleted_at.is_(None)
        )
    ).scalar()
    if owner is None:
        raise PhotoNotFound(str(photo_id))
    return owner


def read_photo(
    conn: Connection, store: PhotoStore, photo_id: uuid.UUID, variant: Variant = "full"
) -> bytes:
    """Odszyfrowany JPEG. Tylko dla właściciela."""
    return store.read(_owned_photo(conn, photo_id), photo_id, variant)


def delete_photo(conn: Connection, store: PhotoStore, photo_id: uuid.UUID) -> None:
    """Plik znika od razu; wiersz zostaje jako znacznik usunięcia dla synchronizacji."""
    owner = _owned_photo(conn, photo_id)
    conn.execute(
        update(ProgressPhoto).where(ProgressPhoto.id == photo_id).values(deleted_at=func.now())
    )
    store.delete(owner, photo_id)
