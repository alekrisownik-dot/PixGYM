"""Odznaki, historia rang i zdjęcia z danych w bazie (rola aplikacji, pod RLS)."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import insert, text, update

from pixgym.core.ids import uuid7
from pixgym.models import BodyMeasurement, ProgressPhoto, User
from pixgym.services.achievements import (
    compare_photos,
    rank_timeline,
    user_badges,
    user_photo_reminders,
)
from pixgym.services.strength import refresh_exercise
from tests.conftest import make_user
from tests.test_strength_service import BENCH, add_session, at


@pytest.fixture
def athlete(owner_engine):
    with owner_engine.begin() as conn:
        uid = make_user(conn, "athlete")
        conn.execute(update(User).where(User.id == uid).values(sex="male"))
        conn.execute(
            insert(BodyMeasurement).values(
                id=uuid7(), user_id=uid, measured_at=at(1), weight_kg=Decimal("80")
            )
        )
        # 70 × 8 = 1RM 88.67 (1.11 × masa ciała, Exploit Dev),
        # tydzień później 85 × 6 = 102 (1.28 ×, Black Hat).
        add_session(conn, uid, BENCH, 1, [("working", 70, 8, None, None)])
        add_session(conn, uid, BENCH, 8, [("working", 85, 6, None, None)])
        photos = {}
        for name, pose, taken in [
            ("first", "front", datetime(2026, 7, 1, 8, tzinfo=UTC)),
            ("last", "front", datetime(2026, 10, 1, 8, tzinfo=UTC)),
            ("side", "side", datetime(2026, 9, 1, 8, tzinfo=UTC)),
        ]:
            photos[name] = uuid7()
            conn.execute(
                insert(ProgressPhoto).values(
                    id=photos[name],
                    user_id=uid,
                    taken_at=taken,
                    pose=pose,
                    width=100,
                    height=100,
                    size_bytes=1,
                )
            )
    yield {"user": uid, "photos": photos}
    with owner_engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": uid})


def test_rank_timeline(as_user, athlete):
    uid = athlete["user"]
    with as_user(uid) as conn:
        refresh_exercise(conn, uid, BENCH)
        timeline = rank_timeline(conn, uid)
    assert [(e.title, e.date) for e in timeline["bench_press"]] == [
        ("Exploit Dev", "2026-07-01"),
        ("Black Hat", "2026-07-08"),
    ]
    assert timeline["pull_up"] == []


def test_badges_from_real_data(as_user, athlete):
    uid = athlete["user"]
    with as_user(uid) as conn:
        refresh_exercise(conn, uid, BENCH)
        badges = {b.slug: b for b in user_badges(conn, uid)}
    earned = {slug: b.earned_at for slug, b in badges.items() if b.earned_at}
    assert earned == {
        "first_blood": "2026-07-01",
        "buffer_overflow": "2026-07-08",
        "privilege_escalation": "2026-07-08",
        "snapshot": "2026-07-01",
        "git_diff": "2026-10-01",
    }
    # Postęp do kolejnych: 2 ciężkie serie w lipcu, 4/5 rang (Black Hat), 1/4 bojów.
    assert badges["brute_force"].progress == 0.02
    assert badges["sudo"].progress == 0.8
    assert badges["full_stack"].progress == 0.25


def test_one_heavy_set_counts_once_for_exploit_chain(as_user, athlete):
    # Seria 85 × 6 pobiła kilka rekordów naraz (e1RM, 2/3/5RM, seria), a to jedna seria.
    uid = athlete["user"]
    with as_user(uid) as conn:
        refresh_exercise(conn, uid, BENCH)
        chain = next(b for b in user_badges(conn, uid) if b.slug == "exploit_chain")
    assert chain.progress == 0.2


def test_photo_reminders_and_comparison(as_user, athlete):
    uid = athlete["user"]
    with as_user(uid) as conn:
        reminders = user_photo_reminders(conn, uid, today=date(2026, 10, 20))
        pair = compare_photos(conn, uid, "front")
    assert [(r.pose, r.days_since, r.due) for r in reminders] == [
        ("front", 19, False),
        ("side", 49, True),
        ("back", None, True),
    ]
    assert (pair.before_id, pair.after_id, pair.days_between) == (
        str(athlete["photos"]["first"]),
        str(athlete["photos"]["last"]),
        92,
    )


def test_other_user_sees_no_badges_from_athlete(as_user, owner_engine, athlete):
    with owner_engine.begin() as conn:
        stranger = make_user(conn, "stranger")
    with as_user(stranger) as conn:
        assert all(b.earned_at is None for b in user_badges(conn, stranger))
        assert compare_photos(conn, stranger, "front") is None
