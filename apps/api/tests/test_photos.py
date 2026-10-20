"""Zdjęcia postępu: usuwanie metadanych, szyfrowanie, zgoda i izolacja użytkowników."""

import base64
import io
import os
from datetime import UTC, datetime

import pytest
from PIL import Image
from sqlalchemy import insert, select

from pixgym.models import ProgressPhoto, UserSettings
from pixgym.services.photos import (
    PhotoError,
    PhotoNotFound,
    PhotoStore,
    add_photo,
    delete_photo,
    process_image,
    read_photo,
)
from tests.conftest import make_user

GPS_TAG, ORIENTATION_TAG, ARTIST_TAG = 0x8825, 0x0112, 0x013B


def jpeg(width=300, height=200, orientation=None, gps=False, fmt="JPEG") -> bytes:
    img = Image.new("RGB", (width, height), (200, 30, 30))
    img.paste((30, 200, 30), (0, 0, width // 2, height))  # lewa połowa zielona
    exif = Image.Exif()
    exif[ARTIST_TAG] = "Jan Kowalski"
    if orientation:
        exif[ORIENTATION_TAG] = orientation
    if gps:
        exif.get_ifd(GPS_TAG).update({1: "N", 2: (52.0, 13.0, 0.0), 3: "E", 4: (21.0, 0.0, 0.0)})
    buf = io.BytesIO()
    img.save(buf, fmt, exif=exif)
    return buf.getvalue()


@pytest.fixture
def store(tmp_path):
    return PhotoStore(tmp_path, base64.b64encode(os.urandom(32)).decode())


@pytest.fixture
def consenting_user(owner_engine):
    with owner_engine.begin() as conn:
        uid = make_user(conn, "photo")
        conn.execute(insert(UserSettings).values(user_id=uid, body_consent_at=datetime.now(UTC)))
    return uid


def test_strips_all_metadata_including_gps():
    out = process_image(jpeg(gps=True))
    with Image.open(io.BytesIO(out.full)) as img:
        assert dict(img.getexif()) == {}
        assert "exif" not in img.info
    assert b"Kowalski" not in out.full


def test_applies_exif_rotation_before_stripping():
    # Orientacja 6 = obrót o 90°: telefon trzymany pionowo.
    out = process_image(jpeg(300, 200, orientation=6))
    assert (out.width, out.height) == (200, 300)


def test_resizes_and_makes_thumbnail():
    out = process_image(jpeg(4000, 3000))
    assert max(out.width, out.height) == 2048
    with Image.open(io.BytesIO(out.thumb)) as thumb:
        assert max(thumb.size) == 400


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"<?php system($_GET['x']); ?>", "nie jest poprawne"),
        (jpeg(fmt="GIF"), "formaty"),
        (b"x" * (20 * 1024 * 1024 + 1), "za duże"),
    ],
)
def test_rejects_bad_files(data, message):
    with pytest.raises(PhotoError, match=message):
        process_image(data)


@pytest.mark.filterwarnings("ignore::PIL.Image.DecompressionBombWarning")
def test_rejects_decompression_bomb():
    # Mały plik, który po rozpakowaniu miałby 100 Mpx.
    buf = io.BytesIO()
    Image.new("1", (10_000, 10_000)).save(buf, "PNG")
    assert len(buf.getvalue()) < 100_000
    with pytest.raises(PhotoError):
        process_image(buf.getvalue())


def test_files_are_encrypted_at_rest(store, as_user, consenting_user):
    with as_user(consenting_user) as conn:
        photo_id = add_photo(conn, store, consenting_user, jpeg(), datetime.now(UTC))
        files = list(store.root.rglob("*.enc"))
        assert len(files) == 2
        for f in files:
            assert not f.read_bytes().startswith(b"\xff\xd8")  # nagłówek JPEG
        assert read_photo(conn, store, photo_id).startswith(b"\xff\xd8")


def test_file_cannot_be_swapped_between_users(store, consenting_user):
    other = consenting_user.__class__(int=consenting_user.int + 1)
    store.write(consenting_user, consenting_user, "full", b"secret")
    path = store._path(consenting_user, consenting_user, "full")
    target = store._path(other, consenting_user, "full")
    target.parent.mkdir(parents=True)
    target.write_bytes(path.read_bytes())
    with pytest.raises(PhotoNotFound):
        store.read(other, consenting_user, "full")


def test_requires_body_consent(store, as_user, owner_engine):
    with owner_engine.begin() as conn:
        uid = make_user(conn, "noconsent")
    with as_user(uid) as conn, pytest.raises(PhotoError, match="zgody"):
        add_photo(conn, store, uid, jpeg(), datetime.now(UTC))
    assert list(store.root.rglob("*")) == []


def test_other_user_cannot_read_or_delete(store, as_user, owner_engine, consenting_user):
    with as_user(consenting_user) as conn:
        photo_id = add_photo(conn, store, consenting_user, jpeg(), datetime.now(UTC))
        conn.commit()
    with owner_engine.begin() as conn:
        intruder = make_user(conn, "intruder")
    with as_user(intruder) as conn:
        with pytest.raises(PhotoNotFound):
            read_photo(conn, store, photo_id)
        with pytest.raises(PhotoNotFound):
            delete_photo(conn, store, photo_id)
    with as_user(consenting_user) as conn:
        assert read_photo(conn, store, photo_id, "thumb").startswith(b"\xff\xd8")


def test_delete_removes_file_and_keeps_tombstone(store, as_user, consenting_user):
    with as_user(consenting_user) as conn:
        photo_id = add_photo(conn, store, consenting_user, jpeg(), datetime.now(UTC), "side")
        delete_photo(conn, store, photo_id)
        assert list(store.root.rglob("*.enc")) == []
        deleted_at = conn.execute(
            select(ProgressPhoto.deleted_at).where(ProgressPhoto.id == photo_id)
        ).scalar_one()
        assert deleted_at is not None
        with pytest.raises(PhotoNotFound):
            read_photo(conn, store, photo_id)


def test_store_requires_valid_key(tmp_path):
    with pytest.raises(RuntimeError, match="PIXGYM_PHOTO_KEY"):
        PhotoStore(tmp_path, None)
    with pytest.raises(RuntimeError, match="32 bajty"):
        PhotoStore(tmp_path, base64.b64encode(b"short").decode())
