"""Powiadomienia Web Push: przypomnienie o jutrzejszych wydarzeniach i Bit pytający o trening.

Pętla co kilka minut sprawdza, komu wypadła już godzina przypomnień (czas lokalny użytkownika),
i raz na dzień wysyła mu wiadomość o jutrze. Co wysłaliśmy, zapisuje reminders_sent, więc
restart serwera nie dubluje powiadomień.
"""

import asyncio
import base64
import json
import logging
import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import Connection, delete, select, text
from sqlalchemy.dialects.postgresql import insert

from pixgym.core.config import get_settings
from pixgym.core.ids import uuid7
from pixgym.db.session import get_engine, set_user_stmt
from pixgym.models import (
    CalendarEvent,
    Program,
    PushSubscription,
    ReminderSent,
    UserSettings,
    WorkoutSession,
)
from pixgym.services import programs

log = logging.getLogger(__name__)

CHECK_EVERY_S = 300
# Po tej godzinie (czas lokalny) już nie przypominamy o jutrze, np. po długiej przerwie serwera.
LAST_HOUR = 23

KIND_ICONS = {"event": "📌", "competition": "🏆", "trip": "✈️", "health": "🩺", "rest": "😴"}

BIT_ASKS = [
    "Jutro {name}. Idziesz?",
    "Jutro w planie {name}. Wchodzisz w to?",
    "Jutro {name}. Robimy to?",
    "Psst, jutro {name}. Widzimy się na siłowni?",
]


class PushOff(RuntimeError):
    """Serwer nie ma klucza VAPID (PIXGYM_VAPID_PRIVATE_KEY)."""


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _private_key() -> str:
    key = get_settings().vapid_private_key
    if not key:
        raise PushOff
    return key


def public_key() -> str:
    """Klucz publiczny VAPID (applicationServerKey dla pushManager.subscribe)."""
    raw = base64.urlsafe_b64decode(_private_key() + "==")
    key = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
    point = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64(point)


def new_private_key() -> str:
    """Nowy klucz VAPID do .env: python -m pixgym.services.push"""
    key = ec.generate_private_key(ec.SECP256R1())
    return _b64(key.private_numbers().private_value.to_bytes(32, "big"))


# --- subskrypcje (transakcja użytkownika) ---


def subscribe(conn: Connection, user_id: uuid.UUID, data: dict[str, Any]) -> None:
    """Telefon może zmienić właściciela (wylogowanie i inne konto): endpoint jest unikalny."""
    conn.execute(delete(PushSubscription).where(PushSubscription.endpoint == data["endpoint"]))
    conn.execute(
        insert(PushSubscription)
        .values(id=uuid7(), user_id=user_id, **data)
        .on_conflict_do_nothing(index_elements=["endpoint"])
    )


def unsubscribe(conn: Connection, endpoint: str) -> None:
    conn.execute(delete(PushSubscription).where(PushSubscription.endpoint == endpoint))


def _subscriptions(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(select(PushSubscription)).all()
    return [{"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}} for s in rows]


# --- treść przypomnień ---


def _workout_names(conn: Connection, user_id: uuid.UUID, today: date) -> list[str] | None:
    """Treningi na jutro: zaplanowane w kalendarzu albo z aktywnego planu. None = brak treningu."""
    tomorrow = today + timedelta(days=1)
    events = conn.execute(
        select(CalendarEvent.kind, CalendarEvent.title).where(CalendarEvent.date == tomorrow)
    ).all()
    if any(e.kind == "rest" for e in events):
        return None
    names = [e.title for e in events if e.kind == "workout"]

    program_id = conn.execute(
        select(UserSettings.active_program_id).where(UserSettings.user_id == user_id)
    ).scalar()
    schedule = (
        conn.execute(
            select(Program.schedule).where(Program.id == program_id, Program.deleted_at.is_(None))
        ).scalar()
        if program_id
        else None
    )
    if schedule == "weekdays":
        days = programs.get_program(conn, user_id, program_id)["days"]
        names += [d["name"] for d in days if tomorrow.weekday() in d["weekdays"]]
    elif schedule == "flexible" and not names:
        # Plan elastyczny: pytamy o następny dzień z kolejki, dopóki tydzień nie jest zaliczony.
        # Dzień po treningu jest wolny.
        trained_today = conn.execute(
            select(WorkoutSession.id).where(
                WorkoutSession.local_date == today, WorkoutSession.deleted_at.is_(None)
            )
        ).first()
        days = programs.get_program(conn, user_id, program_id)["days"]
        if days and not trained_today:
            week_start = tomorrow - timedelta(days=tomorrow.weekday())
            progress = programs.plan_progress(conn, user_id, program_id, week_start)
            done = {d["day_index"] for d in progress["done"]}
            if len(done) < len(days):
                last = progress["last_day_index"]
                start = 0 if last is None else last + 1
                order = [days[(start + i) % len(days)] for i in range(len(days))]
                nxt = next(d for d in order if d["day_index"] not in done)
                names.append(nxt["name"])
    names = list(dict.fromkeys(names))
    return names or None


def reminders(conn: Connection, user_id: uuid.UUID, today: date) -> list[dict[str, Any]]:
    """Powiadomienia o jutrze (treść dla service workera)."""
    tomorrow = today + timedelta(days=1)
    out: list[dict[str, Any]] = []

    events = conn.execute(
        select(CalendarEvent)
        .where(
            CalendarEvent.date == tomorrow,
            CalendarEvent.remind,
            CalendarEvent.kind != "workout",
        )
        .order_by(CalendarEvent.created_at)
    ).all()
    if events:
        lines = [f"{e.icon or KIND_ICONS.get(e.kind, '📌')} {e.title}" for e in events]
        one = len(events) == 1
        out.append(
            {
                "title": f"Jutro: {lines[0]}" if one else f"Jutro masz {len(events)} wydarzenia",
                "body": (events[0].note or "Przypomnienie na jutro.") if one else "\n".join(lines),
                "tag": f"events-{tomorrow}",
                "url": "/#/",
            }
        )

    wants = conn.execute(
        select(UserSettings.remind_workouts).where(UserSettings.user_id == user_id)
    ).scalar()
    names = _workout_names(conn, user_id, today) if wants else None
    if names:
        name = " + ".join(names)
        out.append(
            {
                "title": "🤖 Bit pyta",
                "body": random.choice(BIT_ASKS).format(name=name),
                "tag": f"workout-{tomorrow}",
                "url": "/#/",
                "ask": True,
            }
        )
    return out


# --- wysyłka ---


def _send(sub: dict[str, Any], payload: dict[str, Any]) -> bool | None:
    """Wysyła jedno powiadomienie. False = subskrypcja wygasła (do usunięcia), None = nie doszło."""
    from pywebpush import WebPushException, webpush
    from requests import RequestException

    try:
        webpush(
            sub,
            json.dumps(payload, ensure_ascii=False),
            vapid_private_key=_private_key(),
            vapid_claims={"sub": get_settings().vapid_subject},
            ttl=12 * 3600,
            timeout=10,
        )
    except WebPushException as e:
        if getattr(e.response, "status_code", None) in (404, 410):
            return False
        log.warning("push nie doszedł: %s", e)
        return None
    except RequestException as e:
        # Brak sieci albo serwer push nie odpowiada: pomijamy, nie psujemy reszty pętli.
        log.warning("push nie doszedł: %s", e)
        return None
    return True


async def deliver(user_id: uuid.UUID, subs: list[dict[str, Any]], messages: list[dict]) -> int:
    """Wysyła wiadomości na wszystkie telefony użytkownika; usuwa wygasłe subskrypcje."""
    sent = 0
    for sub in subs:
        for msg in messages:
            ok = await asyncio.to_thread(_send, sub, msg)
            if ok is False:
                async with get_engine().begin() as conn:
                    await conn.execute(set_user_stmt(user_id))
                    await conn.run_sync(unsubscribe, sub["endpoint"])
                break
            sent += ok is True
    return sent


def _claim(conn: Connection, user_id: uuid.UUID, today: date):
    """Rezerwuje przypomnienie o jutrze. None = już wysłane."""
    claimed = conn.execute(
        insert(ReminderSent)
        .values(user_id=user_id, for_date=today + timedelta(days=1))
        .on_conflict_do_nothing()
        .returning(ReminderSent.user_id)
    ).first()
    if claimed is None:
        return None
    return _subscriptions(conn), reminders(conn, user_id, today)


async def tick(now: datetime) -> int:
    """Jedno przejście pętli. Zwraca liczbę wysłanych powiadomień."""
    async with get_engine().begin() as conn:
        users = (await conn.execute(text("SELECT * FROM push_reminder_users()"))).all()
    sent = 0
    for u in users:
        try:
            local = now.astimezone(ZoneInfo(u.timezone))
        except (KeyError, ValueError):
            local = now.astimezone(ZoneInfo("Europe/Warsaw"))
        if not u.reminder_hour <= local.hour < LAST_HOUR:
            continue
        async with get_engine().begin() as conn:
            await conn.execute(set_user_stmt(u.user_id))
            got = await conn.run_sync(_claim, u.user_id, local.date())
        if got and got[1]:
            sent += await deliver(u.user_id, *got)
    return sent


async def loop() -> None:
    while True:
        try:
            await tick(datetime.now().astimezone())
        except PushOff:
            return
        except Exception:
            log.exception("pętla przypomnień")
        await asyncio.sleep(CHECK_EVERY_S)


if __name__ == "__main__":
    print(f"PIXGYM_VAPID_PRIVATE_KEY={new_private_key()}")
