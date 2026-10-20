"""Ranking znajomych: widoczność tylko za zgodą, kolejność, rangi."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import insert, text, update

from pixgym.core.ids import uuid7
from pixgym.models import PersonalRecord, User, UserSettings, WorkoutSession
from pixgym.seed import builtin_id
from pixgym.services.leaderboard import leaderboard, my_ranks
from tests.conftest import make_user

BENCH = builtin_id("exercise", "bench_press")


def lifter(conn, name, e1rm, bodyweight, sex="male", opt_in=True):
    uid = make_user(conn, name)
    conn.execute(update(User).where(User.id == uid).values(display_name=name, sex=sex))
    conn.execute(insert(UserSettings).values(user_id=uid, leaderboard_opt_in=opt_in))
    conn.execute(
        insert(WorkoutSession).values(
            id=uuid7(),
            user_id=uid,
            started_at=datetime(2026, 9, 1, tzinfo=UTC),
            local_date=date(2026, 9, 1),
            bodyweight_kg=bodyweight,
        )
    )
    if e1rm is not None:
        conn.execute(
            insert(PersonalRecord).values(
                id=uuid7(),
                user_id=uid,
                exercise_id=BENCH,
                record_type="e1rm",
                value=Decimal(str(e1rm)),
                achieved_at=datetime(2026, 9, 1, tzinfo=UTC),
            )
        )
    return uid


@pytest.fixture
def gym(owner_engine):
    with owner_engine.begin() as conn:
        conn.execute(text("UPDATE user_settings SET leaderboard_opt_in = false"))
        people = {
            "ola": lifter(conn, "ola", 70, 58, "female"),
            "kuba": lifter(conn, "kuba", 120, 95),
            "piotr": lifter(conn, "piotr", 107.8, 82.4),
            "ukryty": lifter(conn, "ukryty", 200, 100, opt_in=False),
            "bez_wyniku": lifter(conn, "bez_wyniku", None, 80),
        }
    yield people
    with owner_engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": list(people.values())})


def names(rows):
    return [(r.position, r.display_name) for r in rows]


def test_ranking_by_kg(as_user, gym):
    with as_user(gym["piotr"]) as conn:
        rows = leaderboard(conn, gym["piotr"], "bench_press", "kg")
    assert names(rows) == [(1, "kuba"), (2, "piotr"), (3, "ola")]
    me = next(r for r in rows if r.is_me)
    assert (me.display_name, me.title) == ("piotr", "Black Hat")


def test_ranking_by_dots_favours_lighter_lifter(as_user, gym):
    with as_user(gym["piotr"]) as conn:
        rows = leaderboard(conn, gym["piotr"], "bench_press", "dots")
    # Ola wyciska mniej, ale względem masy ciała i płci wypada najlepiej.
    assert names(rows) == [(1, "ola"), (2, "kuba"), (3, "piotr")]
    assert [r.value for r in rows] == [79.3, 75.58, 73.07]


def test_people_without_opt_in_are_invisible(as_user, gym):
    with as_user(gym["kuba"]) as conn:
        rows = leaderboard(conn, gym["kuba"], "bench_press")
    assert "ukryty" not in [r.display_name for r in rows]


def test_without_opt_in_you_see_nothing(as_user, gym):
    with as_user(gym["ukryty"]) as conn:
        assert leaderboard(conn, gym["ukryty"], "bench_press") == []


def test_leaderboard_does_not_leak_other_data(as_user, gym):
    # Funkcja rankingu omija RLS tylko dla siebie; zwykłe zapytania dalej widzą tylko swoje.
    with as_user(gym["piotr"]) as conn:
        assert conn.execute(text("SELECT count(*) FROM personal_records")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM workout_sessions")).scalar() == 1


def test_only_ranked_lifts(as_user, gym):
    with as_user(gym["piotr"]) as conn, pytest.raises(ValueError, match="rankingowy"):
        leaderboard(conn, gym["piotr"], "back_squat")


def test_my_ranks_without_opt_in(as_user, gym):
    with as_user(gym["ukryty"]) as conn:
        ranks = my_ranks(conn, gym["ukryty"])
    assert ranks["bench_press"].title == "Kernel Panic"  # 200 kg przy 100 kg masy
    assert ranks["pull_up"] is None  # brak wyniku


def test_app_role_cannot_create_own_definer_functions(app_engine):
    # Gdyby rola aplikacji mogła tworzyć funkcje, mogłaby obejść RLS jak leaderboard_entries.
    with app_engine.connect() as conn:
        allowed = conn.execute(text("SELECT has_schema_privilege('public', 'CREATE')")).scalar()
    assert allowed is False
