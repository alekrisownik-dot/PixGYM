"""API przez HTTP: logowanie, zaproszenia, CSRF, refresh tokeny, trening, izolacja."""

import os
import uuid
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
import redis
from fastapi.testclient import TestClient
from sqlalchemy import make_url, select, text

from pixgym.admin import create_admin, create_invite
from pixgym.api.v1.catalog import photo_store
from pixgym.core.config import get_settings
from pixgym.core.ids import uuid7
from pixgym.db import session as db_session
from pixgym.models import AuditLog
from pixgym.seed import builtin_id

from .conftest import TEST_DB

PASSWORD = "correct horse battery"
BENCH = builtin_id("exercise", "bench_press")


class Api:
    """TestClient z nagłówkiem CSRF, tak jak robi to front."""

    def __init__(self, client: TestClient):
        self.c = client
        self.c.get("/api/v1/health")

    def _headers(self) -> dict[str, str]:
        return {"x-csrf-token": self.c.cookies.get("pixgym_csrf") or ""}

    def get(self, url: str, **kw):
        return self.c.get(url, **kw)

    def post(self, url: str, **kw):
        return self.c.post(url, headers=self._headers(), **kw)

    def put(self, url: str, **kw):
        return self.c.put(url, headers=self._headers(), **kw)

    def patch(self, url: str, **kw):
        return self.c.patch(url, headers=self._headers(), **kw)

    def delete(self, url: str, **kw):
        return self.c.delete(url, headers=self._headers(), **kw)

    def refresh_with(self, token: str):
        """Odświeżenie z podanym refresh tokenem (np. skradzionym), poza słoikiem ciasteczek."""
        return self.c.post(
            "/api/v1/auth/refresh",
            headers={"cookie": f"pixgym_refresh={token}; pixgym_csrf=x", "x-csrf-token": "x"},
        )

    def refresh_token(self) -> str:
        return self.c.cookies.get("pixgym_refresh", path="/api/v1/auth")


@pytest.fixture(scope="module")
def app_env(owner_engine, tmp_path_factory) -> Iterator[None]:
    """API na bazie testowej, bez puli połączeń, z osobną bazą Redisa."""
    settings = get_settings()
    env = {
        "PIXGYM_DATABASE_URL": make_url(settings.database_url)
        .set(database=TEST_DB)
        .render_as_string(hide_password=False),
        "PIXGYM_REDIS_URL": settings.redis_url.rsplit("/", 1)[0] + "/15",
        "PIXGYM_DB_NULL_POOL": "true",
        "PIXGYM_PHOTO_DIR": str(tmp_path_factory.mktemp("photos")),
    }
    saved = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    get_settings.cache_clear()
    db_session.get_engine.cache_clear()
    photo_store.cache_clear()
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    get_settings.cache_clear()
    db_session.get_engine.cache_clear()


@pytest.fixture
def new_client(app_env) -> Iterator:
    """new_client() -> osobna „przeglądarka” (własne ciasteczka)."""
    from pixgym.main import app

    redis.Redis.from_url(get_settings().redis_url).flushdb()
    clients: list[TestClient] = []

    def make() -> Api:
        c = TestClient(app, base_url="https://testserver")
        c.__enter__()
        clients.append(c)
        return Api(c)

    yield make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def admin(owner_engine) -> Iterator[str]:
    email = f"admin-{uuid7()}@example.com"
    with owner_engine.begin() as conn:
        create_admin(conn, email, "Admin", PASSWORD)
    yield email
    with owner_engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE email = :e"), {"e": email})


def invite(owner_engine, admin_email: str) -> str:
    with owner_engine.begin() as conn:
        return create_invite(conn, admin_email)


def register(api: Api, code: str, name: str = "friend") -> tuple[str, object]:
    email = f"{name}-{uuid7()}@example.com"
    r = api.post(
        "/api/v1/auth/register",
        json={"invite_code": code, "email": email, "password": PASSWORD, "display_name": name},
    )
    return email, r


def login(api: Api, email: str, password: str = PASSWORD):
    return api.post("/api/v1/auth/login", json={"email": email, "password": password})


# --- konto ---


def test_register_with_invite_logs_in(new_client, owner_engine, admin):
    api = new_client()
    code = invite(owner_engine, admin)
    email, r = register(api, code.lower().replace("-", " "))  # wpisany byle jak też działa
    assert r.status_code == 201, r.text
    assert r.json()["email"] == email
    assert r.json()["role"] == "user"
    me = api.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["leaderboard_visible"] is True


def test_invite_is_single_use(new_client, owner_engine, admin):
    api = new_client()
    code = invite(owner_engine, admin)
    assert register(api, code)[1].status_code == 201
    other = new_client()
    assert register(other, code)[1].status_code == 400


def test_bad_invite_and_taken_email(new_client, owner_engine, admin):
    api = new_client()
    assert register(api, "AAAA-BBBB-CCCC-DDDD")[1].json()["detail"] == "invalid_invite"
    r = api.post(
        "/api/v1/auth/register",
        json={
            "invite_code": invite(owner_engine, admin),
            "email": admin.upper(),
            "password": PASSWORD,
            "display_name": "x",
        },
    )
    assert r.status_code == 409


def test_login_and_wrong_password(new_client, admin):
    api = new_client()
    assert login(api, admin, "wrong password!").status_code == 401
    assert api.get("/api/v1/me").status_code == 401
    r = login(api, admin.upper())
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    assert api.get("/api/v1/me").status_code == 200


def test_login_is_rate_limited(new_client, admin):
    api = new_client()
    codes = [login(api, admin, "wrong password!").status_code for _ in range(6)]
    assert codes == [401] * 5 + [429]
    # Także poprawne hasło, dopóki nie minie minuta.
    assert login(api, admin).status_code == 429


def test_unknown_email_looks_like_wrong_password(new_client):
    api = new_client()
    r = login(api, "nobody@example.com")
    assert r.status_code == 401
    assert r.json()["detail"] == "invalid_credentials"


def test_mutation_without_csrf_header_is_rejected(new_client, admin):
    api = new_client()
    r = api.c.post("/api/v1/auth/login", json={"email": admin, "password": PASSWORD})
    assert r.status_code == 403
    r = api.c.post(
        "/api/v1/auth/login",
        json={"email": admin, "password": PASSWORD},
        headers={"x-csrf-token": "forged"},
    )
    assert r.status_code == 403


def test_refresh_rotates_and_detects_reuse(new_client, admin, owner_engine):
    api = new_client()
    login(api, admin)
    old = api.refresh_token()
    assert api.post("/api/v1/auth/refresh").status_code == 204
    new = api.refresh_token()
    assert new and new != old
    assert api.get("/api/v1/me").status_code == 200

    # Ktoś używa starego (skradzionego) tokenu: odmowa i unieważnienie całej rodziny.
    assert api.refresh_with(old).status_code == 401
    assert api.post("/api/v1/auth/refresh").status_code == 401
    user_id = uuid.UUID(old.split(".")[0])
    with owner_engine.connect() as conn:
        actions = (
            conn.execute(select(AuditLog.action).where(AuditLog.user_id == user_id)).scalars().all()
        )
    assert "refresh_reuse" in actions


def test_forged_refresh_token_for_other_user(new_client, admin):
    api = new_client()
    login(api, admin)
    _, secret = api.refresh_token().split(".", 1)
    assert new_client().refresh_with(f"{uuid.uuid4()}.{secret}").status_code == 401
    assert new_client().refresh_with("garbage").status_code == 401


def test_logout_revokes_refresh(new_client, admin):
    api = new_client()
    login(api, admin)
    token = api.refresh_token()
    assert api.post("/api/v1/auth/logout").status_code == 204
    assert api.get("/api/v1/me").status_code == 401
    assert api.refresh_with(token).status_code == 401


def test_only_admin_creates_invites(new_client, owner_engine, admin):
    api = new_client()
    login(api, admin)
    r = api.post("/api/v1/invites")
    assert r.status_code == 201
    code = r.json()["code"]
    assert len(api.get("/api/v1/invites").json()) == 1

    friend = new_client()
    assert register(friend, code)[1].status_code == 201
    assert friend.post("/api/v1/invites").status_code == 403
    assert api.get("/api/v1/invites").json()[0]["used_at"] is not None


def test_update_profile(new_client, admin):
    api = new_client()
    login(api, admin)
    r = api.patch("/api/v1/me", json={"sex": "male", "leaderboard_visible": False})
    assert r.status_code == 200
    assert r.json()["sex"] == "male"
    assert r.json()["leaderboard_visible"] is False
    # Roli nie da się sobie zmienić.
    r = api.patch("/api/v1/me", json={"role": "admin", "display_name": "Ja"})
    assert r.json()["display_name"] == "Ja"


# --- trening ---


def start_with_bench(api: Api) -> tuple[str, str]:
    session = api.post("/api/v1/sessions", json={"bodyweight_kg": 80}).json()
    s = api.post(f"/api/v1/sessions/{session['id']}/exercises", json={"exercise_id": str(BENCH)})
    assert s.status_code == 201, s.text
    return session["id"], s.json()["exercises"][0]["id"]


def put_set(api: Api, se_id: str, index: int, kg: float, reps: int, set_id: str | None = None):
    return api.put(
        f"/api/v1/sets/{set_id or uuid7()}",
        json={"session_exercise_id": se_id, "set_index": index, "weight_kg": kg, "reps": reps},
    )


def test_workout_flow(new_client, admin):
    api = new_client()
    login(api, admin)
    assert len(api.get("/api/v1/exercises").json()) >= 150

    session_id, se_id = start_with_bench(api)
    r = put_set(api, se_id, 0, 80, 8)
    assert r.status_code == 200, r.text
    first = r.json()
    assert first["e1rm_kg"] == pytest.approx(101.33, abs=0.01)
    # Pierwszy wynik to rekord, ale niczego nie pobił.
    assert first["records"] and not any(x["beat_previous"] for x in first["records"])

    r = put_set(api, se_id, 1, 85, 8).json()
    e1rm = [x for x in r["records"] if x["record_type"] == "e1rm"]
    assert e1rm and e1rm[0]["beat_previous"] is True

    # Poprawka serii (ten sam ID) i usunięcie.
    fixed = put_set(api, se_id, 0, 80, 10, set_id=first["id"]).json()
    assert fixed["reps"] == 10
    assert api.delete(f"/api/v1/sets/{r['id']}").status_code == 204

    detail = api.get(f"/api/v1/sessions/{session_id}").json()
    assert [s["reps"] for s in detail["exercises"][0]["sets"]] == [10]
    api.patch(f"/api/v1/sessions/{session_id}", json={"ended_at": detail["started_at"]})

    sessions = api.get("/api/v1/sessions").json()
    assert sessions[0]["id"] == session_id
    assert sessions[0]["set_count"] == 1
    assert sessions[0]["tonnage_kg"] == 800

    last = api.get(f"/api/v1/exercises/{BENCH}/last").json()
    assert last["sets"][0]["weight_kg"] == 80
    assert api.get(f"/api/v1/exercises/{BENCH}/last?before_session={session_id}").json() is None

    progress = api.get("/api/v1/progress/exercises").json()
    assert progress[0]["id"] == str(BENCH)
    assert len(api.get(f"/api/v1/exercises/{BENCH}/e1rm").json()) == 1
    assert api.get(f"/api/v1/exercises/{BENCH}/records").json()

    ranks = {r["lift"]: r for r in api.get("/api/v1/ranks").json()}
    assert ranks["bench_press"]["title"] is not None
    assert any(row["is_me"] for row in api.get("/api/v1/leaderboard/bench_press").json())
    badges = {b["slug"]: b for b in api.get("/api/v1/badges").json()}
    assert badges["first_blood"]["earned_at"] is not None

    assert api.delete(f"/api/v1/sessions/{session_id}").status_code == 204
    assert api.get(f"/api/v1/sessions/{session_id}").status_code == 404
    assert api.get(f"/api/v1/exercises/{BENCH}/records").json() == []


def test_other_users_workout_is_invisible(new_client, owner_engine, admin):
    alice = new_client()
    login(alice, admin)
    session_id, se_id = start_with_bench(alice)
    set_id = put_set(alice, se_id, 0, 100, 5).json()["id"]

    bob = new_client()
    register(bob, invite(owner_engine, admin), "bob")
    assert bob.get(f"/api/v1/sessions/{session_id}").status_code == 404
    assert bob.get("/api/v1/sessions").json() == []
    assert put_set(bob, se_id, 1, 200, 1).status_code == 404
    assert bob.delete(f"/api/v1/sets/{set_id}").status_code == 404
    assert bob.delete(f"/api/v1/sessions/{session_id}").status_code == 404
    # Bob zgaduje ID serii Alice i próbuje ją nadpisać we własnym treningu.
    _, bob_se = start_with_bench(bob)
    assert put_set(bob, bob_se, 0, 1, 1, set_id=set_id).status_code == 409
    assert (
        alice.get(f"/api/v1/sessions/{session_id}").json()["exercises"][0]["sets"][0]["weight_kg"]
        == 100
    )


def test_start_and_add_exercise_are_idempotent(new_client, admin):
    """Kolejka offline może wysłać to samo dwa razy."""
    api = new_client()
    login(api, admin)
    sid, seid = str(uuid7()), str(uuid7())
    assert api.post("/api/v1/sessions", json={"id": sid}).status_code == 201
    assert api.post("/api/v1/sessions", json={"id": sid}).status_code == 201
    body = {"id": seid, "exercise_id": str(BENCH)}
    api.post(f"/api/v1/sessions/{sid}/exercises", json=body)
    r = api.post(f"/api/v1/sessions/{sid}/exercises", json=body)
    assert len(r.json()["exercises"]) == 1
    assert len(api.get("/api/v1/sessions").json()) == 1


def jpeg_bytes() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 50, 50)).save(buf, "JPEG")
    return buf.getvalue()


def test_custom_exercise_with_machine_photo(new_client, owner_engine, admin):
    api = new_client()
    login(api, admin)
    meta = api.get("/api/v1/catalog/meta").json()
    assert {"slug": "machine", "name": "Maszyna"} in meta["equipment"]
    r = api.post(
        "/api/v1/exercises",
        json={
            "name": "Wyciskanie na maszynie Hammer",
            "equipment": "machine",
            "primary_muscle": "chest",
            "secondary_muscles": ["triceps", "chest"],
            "notes": "siedzisko 4",
        },
    )
    assert r.status_code == 201, r.text
    ex = r.json()
    assert ex["custom"] and ex["notes"] == "siedzisko 4"
    dup = api.post(
        "/api/v1/exercises",
        json={
            "name": "wyciskanie na maszynie hammer",
            "equipment": "machine",
            "primary_muscle": "chest",
        },
    )
    assert dup.status_code == 400

    p = api.c.post(
        f"/api/v1/exercises/{ex['id']}/photos?caption=Zdrofit",
        content=jpeg_bytes(),
        headers={**api._headers(), "content-type": "image/jpeg"},
    )
    assert p.status_code == 201, p.text
    photo_id = p.json()["id"]
    img = api.get(f"/api/v1/exercise-photos/{photo_id}")
    assert img.status_code == 200 and img.content[:2] == b"\xff\xd8"
    listed = next(e for e in api.get("/api/v1/exercises").json() if e["id"] == ex["id"])
    assert listed["photos"] == [{"id": photo_id, "caption": "Zdrofit"}]

    # Zdjęcie do ćwiczenia wbudowanego też można dodać (inna maszyna na innej siłowni).
    bad = api.c.post(
        f"/api/v1/exercises/{BENCH}/photos", content=b"not an image", headers=api._headers()
    )
    assert bad.status_code == 400

    # Ktoś inny nie widzi ani ćwiczenia, ani zdjęcia.
    other = new_client()
    register(other, invite(owner_engine, admin), "other")
    assert all(e["id"] != ex["id"] for e in other.get("/api/v1/exercises").json())
    assert other.get(f"/api/v1/exercise-photos/{photo_id}").status_code == 404
    assert other.delete(f"/api/v1/exercises/{ex['id']}").status_code == 404
    # Nie da się edytować wbudowanego.
    assert api.patch(f"/api/v1/exercises/{BENCH}", json={"name": "x" * 5}).status_code == 404

    assert api.delete(f"/api/v1/exercise-photos/{photo_id}").status_code == 204
    assert api.get(f"/api/v1/exercise-photos/{photo_id}").status_code == 404
    assert api.delete(f"/api/v1/exercises/{ex['id']}").status_code == 204
    assert all(e["id"] != ex["id"] for e in api.get("/api/v1/exercises").json())


def test_calendar_volume_and_summary(new_client, admin):
    api = new_client()
    login(api, admin)
    session_id, se_id = start_with_bench(api)
    put_set(api, se_id, 0, 80, 8)
    api.patch(f"/api/v1/sessions/{session_id}", json={"ended_at": "2099-01-01T00:00:00Z"})

    s2, se2 = start_with_bench(api)
    put_set(api, se2, 0, 90, 8)

    day = api.get(f"/api/v1/sessions/{session_id}").json()["local_date"]
    cal = api.get(f"/api/v1/calendar?start={day}&end={day}").json()
    assert cal["days"][0]["sessions"] == 2
    assert cal["days"][0]["sets"] == 2
    assert cal["week_streak"] == 1

    vol = {v["muscle"]: v for v in api.get("/api/v1/volume").json()}
    assert vol["chest"]["hard_sets"] == 2
    assert vol["triceps"]["hard_sets"] == 1  # pomocniczy liczy się za pół

    summary = api.get(f"/api/v1/sessions/{s2}/summary").json()
    assert summary["sets"] == 1 and summary["tonnage_kg"] == 720
    assert summary["previous_tonnage_kg"] == 640
    kinds = {r["record_type"] for r in summary["records"]}
    assert "e1rm" in kinds
    # Pierwszy trening niczego nie pobił.
    assert api.get(f"/api/v1/sessions/{session_id}/summary").json()["records"] == []


def test_settings(new_client, admin):
    api = new_client()
    login(api, admin)
    assert api.get("/api/v1/me/settings").json()["default_rest_s"] == 120
    r = api.patch("/api/v1/me/settings", json={"default_rest_s": 90, "bar_weight_kg": 15})
    assert r.json()["default_rest_s"] == 90 and r.json()["bar_weight_kg"] == 15
    bad = api.patch("/api/v1/me/settings", json={"plate_inventory": {"abc": 2}})
    assert bad.status_code == 422


# --- plany ---


def test_copy_template_edit_blocks_and_activate(new_client, admin):
    api = new_client()
    login(api, admin)
    plans = api.get("/api/v1/programs").json()
    ppl = next(p for p in plans if p["builtin"] and p["name"] == "Push / Pull / Legs")
    assert ppl["days"] == 3

    tpl = api.get(f"/api/v1/programs/{ppl['id']}").json()
    assert [d["weekdays"] for d in tpl["days"]] == [[0], [2], [4]]
    # Szablonu nie da się zmienić ani ustawić jako aktywny.
    assert (
        api.put(
            f"/api/v1/programs/{ppl['id']}", json={"name": "x", "days": [{"name": "a"}]}
        ).status_code
        == 404
    )
    assert api.put("/api/v1/me/active-program", json={"program_id": ppl["id"]}).status_code == 400

    mine = api.post(f"/api/v1/programs/{ppl['id']}/copy").json()
    assert not mine["builtin"] and len(mine["days"]) == 3
    assert api.put("/api/v1/me/active-program", json={"program_id": mine["id"]}).status_code == 204

    # Poniedziałek: dwa bloczki; wtorek: nowy dzień.
    days = [
        {
            "name": "Push",
            "weekdays": [0],
            "blocks": [
                {
                    "exercise_id": str(BENCH),
                    "target_sets": 4,
                    "rep_min": 6,
                    "rep_max": 8,
                    "rest_s": 180,
                },
                {
                    "exercise_id": str(builtin_id("exercise", "lateral_raise")),
                    "target_sets": 3,
                    "rep_min": 12,
                    "rep_max": 15,
                },
            ],
        },
        {"name": "Nogi", "weekdays": [1, 4], "blocks": []},
    ]
    r = api.put(f"/api/v1/programs/{mine['id']}", json={"name": "Mój PPL", "days": days})
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["version_no"] == 2 and plan["active"]
    assert [b["name"] for b in plan["days"][0]["blocks"]] == [
        "Wyciskanie sztangi leżąc",
        "Wznosy hantli bokiem",
    ]
    assert plan["days"][1]["weekdays"] == [1, 4]

    bad = dict(days[0], blocks=[{"exercise_id": str(BENCH), "rep_min": 10, "rep_max": 5}])
    assert (
        api.put(f"/api/v1/programs/{mine['id']}", json={"name": "x", "days": [bad]}).status_code
        == 422
    )

    listed = {p["id"]: p for p in api.get("/api/v1/programs").json()}
    assert listed[mine["id"]]["active"] and listed[mine["id"]]["name"] == "Mój PPL"

    # Trening z dnia planu: cele przy ćwiczeniach.
    day_id = plan["days"][0]["id"]
    sid = str(uuid7())
    s = api.post("/api/v1/sessions", json={"id": sid, "program_day_id": day_id}).json()
    assert s["day_name"] == "Push"
    s = api.post(f"/api/v1/sessions/{sid}/exercises", json={"exercise_id": str(BENCH)}).json()
    assert s["exercises"][0]["target"]["target_sets"] == 4
    assert s["exercises"][0]["target"]["rest_s"] == 180

    # Zmiana planu nie zmienia starego treningu (wskazuje na starą wersję dnia).
    api.put(
        f"/api/v1/programs/{mine['id']}",
        json={"name": "Mój PPL", "days": [dict(days[0], blocks=[])]},
    )
    assert api.get(f"/api/v1/sessions/{sid}").json()["exercises"][0]["target"]["target_sets"] == 4

    assert api.delete(f"/api/v1/programs/{mine['id']}").status_code == 204
    assert all(p["id"] != mine["id"] for p in api.get("/api/v1/programs").json())


def test_progression_rules_listed(new_client, admin):
    api = new_client()
    login(api, admin)
    rules = {r["slug"]: r for r in api.get("/api/v1/progression-rules").json()}
    assert rules["double_progression"]["type"] == "double"
    assert rules["double_progression"]["params"]["increment_upper_kg"] == 2.5


def test_plans_are_private(new_client, owner_engine, admin):
    alice = new_client()
    login(alice, admin)
    plan = alice.post(
        "/api/v1/programs", json={"name": "Tajny", "days": [{"name": "Pn", "weekdays": [0]}]}
    ).json()
    bob = new_client()
    register(bob, invite(owner_engine, admin), "bob")
    assert bob.get(f"/api/v1/programs/{plan['id']}").status_code == 404
    assert all(p["id"] != plan["id"] for p in bob.get("/api/v1/programs").json())
    assert bob.put("/api/v1/me/active-program", json={"program_id": plan["id"]}).status_code == 404
    assert bob.delete(f"/api/v1/programs/{plan['id']}").status_code == 404


def test_flexible_plan_counts_days_done_this_week(new_client, admin):
    api = new_client()
    login(api, admin)
    days = [{"name": n, "blocks": []} for n in ("Klata", "Plecy", "Nogi")]
    plan = api.post(
        "/api/v1/programs", json={"name": "Elastyczny", "schedule": "flexible", "days": days}
    ).json()
    assert plan["schedule"] == "flexible"
    listed = {p["id"]: p for p in api.get("/api/v1/programs").json()}
    assert listed[plan["id"]]["schedule"] == "flexible"
    assert (
        api.post(
            "/api/v1/programs", json={"name": "x", "schedule": "random", "days": days}
        ).status_code
        == 422
    )

    today = date.today()
    monday = today - timedelta(days=today.weekday())
    empty = api.get(f"/api/v1/programs/{plan['id']}/progress?start={monday}").json()
    assert empty == {"last_day_index": None, "done": []}

    # „Plecy” zrobione dziś (np. w środę zamiast wtorku) zaliczają dzień 1.
    sid = str(uuid7())
    api.post("/api/v1/sessions", json={"id": sid, "program_day_id": plan["days"][1]["id"]})
    prog = api.get(f"/api/v1/programs/{plan['id']}/progress?start={monday}").json()
    assert prog["last_day_index"] == 1
    assert prog["done"] == [{"day_index": 1, "local_date": str(today), "session_id": sid}]

    # Edycja planu (nowa wersja, nowe id dni) nie gubi zaliczenia; tryb się zmienia.
    plan2 = api.put(
        f"/api/v1/programs/{plan['id']}", json={"name": "Elastyczny", "days": days}
    ).json()
    assert plan2["schedule"] == "weekdays"
    prog = api.get(f"/api/v1/programs/{plan['id']}/progress?start={monday}").json()
    assert [d["day_index"] for d in prog["done"]] == [1]

    # Poprzedni tydzień: nic zaliczonego, ale ostatni dzień zostaje.
    prev = api.get(
        f"/api/v1/programs/{plan['id']}/progress?start={monday - timedelta(days=7)}"
    ).json()
    assert prev == {"last_day_index": 1, "done": []}


def test_calendar_events(new_client, owner_engine, admin):
    api = new_client()
    login(api, admin)
    eid = str(uuid7())
    body = {
        "id": eid,
        "date": "2026-11-14",
        "title": " Zawody w wyciskaniu ",
        "kind": "competition",
    }
    r = api.post("/api/v1/events", json=body)
    assert r.status_code == 201, r.text
    assert r.json() == {
        "id": eid,
        "date": "2026-11-14",
        "title": "Zawody w wyciskaniu",
        "kind": "competition",
        "note": None,
    }
    assert api.post("/api/v1/events", json=body).status_code == 201  # ponowienie z kolejki
    assert api.post("/api/v1/events", json={**body, "id": None, "kind": "x"}).status_code == 422

    got = api.get("/api/v1/events?start=2026-11-01&end=2026-11-30").json()
    assert [e["id"] for e in got] == [eid]
    assert api.get("/api/v1/events?start=2026-12-01&end=2026-12-31").json() == []

    r = api.patch(f"/api/v1/events/{eid}", json={"note": "waga do 83 kg", "date": "2026-11-15"})
    assert r.json()["note"] == "waga do 83 kg" and r.json()["date"] == "2026-11-15"

    # Cudzych wydarzeń nie widać i nie da się ich zmienić.
    bob = new_client()
    register(bob, invite(owner_engine, admin), "bob-events")
    assert bob.get("/api/v1/events?start=2026-11-01&end=2026-11-30").json() == []
    assert bob.patch(f"/api/v1/events/{eid}", json={"title": "x"}).status_code == 404

    # Trening zaplanowany na przyszły dzień.
    plan = {"date": "2027-01-04", "title": "Push", "kind": "workout"}
    assert api.post("/api/v1/events", json=plan).json()["kind"] == "workout"

    assert api.delete(f"/api/v1/events/{eid}").status_code == 204
    assert api.get("/api/v1/events?start=2026-11-01&end=2026-11-30").json() == []
    assert [
        e["title"] for e in api.get("/api/v1/events?start=2027-01-01&end=2027-01-31").json()
    ] == ["Push"]


def test_custom_exercise_per_side(new_client, admin):
    api = new_client()
    login(api, admin)
    r = api.post(
        "/api/v1/exercises",
        json={
            "name": "Wyciskanie na maszynie Hammer",
            "equipment": "machine",
            "primary_muscle": "chest",
            "per_side": True,
        },
    )
    assert r.status_code == 201, r.text
    ex = r.json()
    assert ex["per_side"] is True
    r = api.patch(f"/api/v1/exercises/{ex['id']}", json={"per_side": False})
    assert r.json()["per_side"] is False
    builtin = next(e for e in api.get("/api/v1/exercises").json() if e["slug"] == "bench_press")
    assert builtin["per_side"] is False


def test_body_module(new_client, owner_engine, admin):
    api = new_client()
    login(api, admin)
    start = api.get("/api/v1/body").json()
    assert start["consent"] is False
    # Bez zgody (dane o zdrowiu) nic się nie zapisze.
    assert api.post("/api/v1/body/measurements", json={"weight_kg": 82}).status_code == 400
    assert api.post("/api/v1/body/photos", content=jpeg_bytes()).status_code == 400

    assert api.put("/api/v1/body/consent", json={"consent": True}).status_code == 204
    assert api.post("/api/v1/body/measurements", json={"notes": "x"}).status_code == 400
    m = api.post("/api/v1/body/measurements", json={"weight_kg": 82.4, "waist_cm": 84})
    assert m.status_code == 201, m.text
    assert m.json()["weight_kg"] == 82.4

    before = api.post(
        "/api/v1/body/photos?pose=front&taken_at=2026-07-01T09:00:00Z", content=jpeg_bytes()
    )
    assert before.status_code == 201, before.text
    after = api.post("/api/v1/body/photos?pose=front", content=jpeg_bytes()).json()
    thumb = api.get(f"/api/v1/body/photos/{after['id']}")
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/jpeg"

    pair = api.get("/api/v1/body/compare?pose=front").json()
    assert pair["before_id"] == before.json()["id"] and pair["after_id"] == after["id"]
    assert api.get("/api/v1/body/compare?pose=side").json() is None

    data = api.get("/api/v1/body").json()
    assert len(data["photos"]) == 2 and len(data["measurements"]) == 1
    front = next(r for r in data["reminders"] if r["pose"] == "front")
    assert front["due"] is False
    badges = {b["slug"]: b for b in api.get("/api/v1/badges").json()}
    assert badges["snapshot"]["earned_at"] and badges["git_diff"]["earned_at"]

    # Cudze zdjęcia i pomiary wyglądają jak nieistniejące.
    bob = new_client()
    register(bob, invite(owner_engine, admin), "bob-body")
    assert bob.get(f"/api/v1/body/photos/{after['id']}").status_code == 404
    assert bob.get("/api/v1/body").json()["photos"] == []
    assert bob.delete(f"/api/v1/body/measurements/{m.json()['id']}").status_code == 404

    assert api.delete(f"/api/v1/body/photos/{after['id']}").status_code == 204
    assert api.get(f"/api/v1/body/photos/{after['id']}").status_code == 404
    assert api.delete(f"/api/v1/body/measurements/{m.json()['id']}").status_code == 204


def test_attach_and_detach_workout_from_plan_day(new_client, admin):
    api = new_client()
    login(api, admin)
    days = [{"name": n, "blocks": []} for n in ("Klata", "Plecy")]
    plan = api.post(
        "/api/v1/programs", json={"name": "Pętla", "schedule": "flexible", "days": days}
    ).json()
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    progress = f"/api/v1/programs/{plan['id']}/progress?start={monday}"

    # Pusty trening „bez planu”, potem zaliczony jako Plecy.
    sid = api.post("/api/v1/sessions", json={}).json()["id"]
    day = plan["days"][1]["id"]
    r = api.patch(f"/api/v1/sessions/{sid}", json={"program_day_id": day})
    assert r.status_code == 200, r.text
    assert r.json()["day_name"] == "Plecy"
    assert [d["day_index"] for d in api.get(progress).json()["done"]] == [1]

    # Cofnięcie zaliczenia: trening zostaje, dzień znów do zrobienia.
    api.patch(f"/api/v1/sessions/{sid}", json={"program_day_id": None})
    assert api.get(progress).json()["done"] == []
    assert api.get(f"/api/v1/sessions/{sid}").status_code == 200
    bad = api.patch(f"/api/v1/sessions/{sid}", json={"program_day_id": str(uuid7())})
    assert bad.status_code == 404
