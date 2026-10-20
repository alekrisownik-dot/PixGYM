"""Odznaki, historia awansów rang i przypomnienia o zdjęciach.

Wszystko liczone z danych na żądanie (nic nie jest zapisywane), więc edycja lub usunięcie
treningu może odebrać odznakę. Daty jako tekst YYYY-MM-DD w strefie użytkownika.
"""

import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from pixgym.domain.ranks import RANKED_LIFTS, TITLES, rank_for


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _floor2(x: float) -> float:
    # Epsilon chroni przed 0.29 * 100 = 28.999…; identycznie w TypeScript.
    return math.floor(min(1.0, x) * 100 + 1e-9) / 100


def _week(day: str) -> str:
    d = date.fromisoformat(day)
    return date.fromordinal(d.toordinal() - d.weekday()).isoformat()


# --- historia rang ---


@dataclass
class RankEvent:
    tier: int
    title: str
    date: str
    e1rm_kg: float


def rank_history(lift_slug: str, points: Sequence[dict], sex: str | None) -> list[RankEvent]:
    """Kiedy pierwszy raz zdobyto każdą rangę. points: {date, e1rm_kg, bodyweight_kg}.

    Pierwszy wpis to ranga startowa. Spadek (np. po przybraniu na wadze) nie odbiera rangi
    z historii; aktualną rangę liczy rank_for z bieżącą masą ciała.
    """
    # Jeden punkt na dzień: najlepszy wynik (bez dwóch awansów z tą samą datą).
    by_day: dict[str, dict] = {}
    for p in points:
        if p["date"] not in by_day or p["e1rm_kg"] > by_day[p["date"]]["e1rm_kg"]:
            by_day[p["date"]] = p
    best = -1
    out: list[RankEvent] = []
    for day in sorted(by_day):
        p = by_day[day]
        rank = rank_for(lift_slug, p["e1rm_kg"], p["bodyweight_kg"], sex)
        if rank is not None and rank.tier > best:
            best = rank.tier
            out.append(RankEvent(rank.tier, rank.title, p["date"], p["e1rm_kg"]))
    return out


# --- odznaki ---


@dataclass(frozen=True)
class BadgeDef:
    slug: str
    title: str
    description: str


BADGES = (
    BadgeDef("first_blood", "First Blood", "Pierwszy trening"),
    BadgeDef("buffer_overflow", "Buffer Overflow", "Pierwszy pobity rekord"),
    BadgeDef("exploit_chain", "Exploit Chain", "5 serii z nowym rekordem na jednym treningu"),
    BadgeDef("brute_force", "Brute Force", "100 ciężkich serii w miesiącu"),
    BadgeDef("ddos", "DDoS", "20 ton w jednym tygodniu"),
    BadgeDef("uptime_30d", "Uptime 30d", "30 dni treningów bez przerwy dłuższej niż tydzień"),
    BadgeDef("uptime_180d", "Uptime 180d", "180 dni treningów bez przerwy dłuższej niż tydzień"),
    BadgeDef("privilege_escalation", "Privilege Escalation", "Pierwszy awans rangi"),
    BadgeDef("sudo", "sudo su", "Ranga Root Access w dowolnym boju"),
    BadgeDef("full_stack", "Full Stack", "Ranga Exploit Dev we wszystkich bojach rankingowych"),
    BadgeDef("snapshot", "Snapshot", "Pierwsze zdjęcie postępu"),
    BadgeDef("git_diff", "git diff", "Zdjęcia w tej samej pozie w odstępie 12 tygodni"),
)

BRUTE_FORCE_SETS = 100
DDOS_TONNAGE_KG = 20_000
MAX_GAP_DAYS = 7
EXPLOIT_CHAIN_RECORDS = 5
SUDO_TIER = TITLES.index("Root Access")
FULL_STACK_TIER = TITLES.index("Exploit Dev")
GIT_DIFF_DAYS = 84


@dataclass
class Badge:
    slug: str
    title: str
    description: str
    earned_at: str | None
    progress: float  # 0..1, 1 po zdobyciu


def _threshold_in_buckets(sessions, bucket, field, target) -> tuple[str | None, float]:
    """Pierwsza data, gdy suma w kubełku (miesiąc/tydzień) osiąga cel; najlepszy postęp."""
    totals: dict[str, float] = defaultdict(float)
    earned = None
    for s in sessions:
        key = bucket(s["date"])
        totals[key] += s[field]
        if earned is None and totals[key] >= target:
            earned = s["date"]
    best = max(totals.values(), default=0.0)
    return earned, best / target


def _uptime(dates: list[str], days: int) -> tuple[str | None, float]:
    earned, start, prev, best = None, None, None, 0
    for d in dates:
        if prev is None or _days(prev, d) > MAX_GAP_DAYS:
            start = d
        span = _days(start, d)
        best = max(best, span)
        if earned is None and span >= days:
            earned = d
        prev = d
    return earned, best / days


def evaluate_badges(
    sessions: Sequence[dict],
    beaten_records: Sequence[dict],
    rank_events: dict[str, Sequence[dict]],
    photos: Sequence[dict],
) -> list[Badge]:
    """Stan wszystkich odznak.

    sessions: {date, hard_sets, tonnage_kg}; beaten_records: {date}, jeden wpis na serię,
    która pobiła poprzedni rekord; rank_events: bój -> wpisy z rank_history;
    photos: {pose, date}.
    """
    sessions = sorted(sessions, key=lambda s: s["date"])
    dates = sorted({s["date"] for s in sessions})
    beaten = sorted(r["date"] for r in beaten_records)
    photos = sorted(photos, key=lambda p: p["date"])
    result: dict[str, tuple[str | None, float]] = {}

    result["first_blood"] = (dates[0], 1.0) if dates else (None, 0.0)
    result["buffer_overflow"] = (beaten[0], 1.0) if beaten else (None, 0.0)

    per_day: dict[str, int] = defaultdict(int)
    chain = None
    for d in beaten:
        per_day[d] += 1
        if chain is None and per_day[d] >= EXPLOIT_CHAIN_RECORDS:
            chain = d
    result["exploit_chain"] = (chain, max(per_day.values(), default=0) / EXPLOIT_CHAIN_RECORDS)

    result["brute_force"] = _threshold_in_buckets(
        sessions, lambda d: d[:7], "hard_sets", BRUTE_FORCE_SETS
    )
    result["ddos"] = _threshold_in_buckets(sessions, _week, "tonnage_kg", DDOS_TONNAGE_KG)
    result["uptime_30d"] = _uptime(dates, 30)
    result["uptime_180d"] = _uptime(dates, 180)

    promotions = sorted(e["date"] for events in rank_events.values() for e in list(events)[1:])
    result["privilege_escalation"] = (promotions[0], 1.0) if promotions else (None, 0.0)

    all_events = sorted(
        (e for events in rank_events.values() for e in events), key=lambda e: e["date"]
    )
    sudo = next((e["date"] for e in all_events if e["tier"] >= SUDO_TIER), None)
    top = max((e["tier"] for e in all_events), default=0)
    result["sudo"] = (sudo, top / SUDO_TIER)

    reached = []
    for lift in RANKED_LIFTS:
        hit = next(
            (e["date"] for e in rank_events.get(lift, ()) if e["tier"] >= FULL_STACK_TIER), None
        )
        if hit:
            reached.append(hit)
    full = max(reached) if len(reached) == len(RANKED_LIFTS) else None
    result["full_stack"] = (full, len(reached) / len(RANKED_LIFTS))

    result["snapshot"] = (photos[0]["date"], 1.0) if photos else (None, 0.0)

    first_by_pose: dict[str, str] = {}
    diff, best_span = None, 0
    for p in photos:
        first = first_by_pose.setdefault(p["pose"], p["date"])
        span = _days(first, p["date"])
        best_span = max(best_span, span)
        if diff is None and span >= GIT_DIFF_DAYS:
            diff = p["date"]
    result["git_diff"] = (diff, best_span / GIT_DIFF_DAYS)

    return [
        Badge(
            b.slug,
            b.title,
            b.description,
            result[b.slug][0],
            1.0 if result[b.slug][0] else _floor2(result[b.slug][1]),
        )
        for b in BADGES
    ]


# --- zdjęcia ---

POSES = ("front", "side", "back")
PHOTO_INTERVAL_DAYS = 28


@dataclass
class PhotoReminder:
    pose: str
    last_taken: str | None
    days_since: int | None
    due: bool


def photo_reminders(
    photos: Sequence[dict], today: str, interval_days: int = PHOTO_INTERVAL_DAYS
) -> list[PhotoReminder]:
    """Dla każdej pozy: czy pora na nowe zdjęcie (brak albo ostatnie sprzed interval_days)."""
    last: dict[str, str] = {}
    for p in photos:
        if p["pose"] in POSES and p["date"] > last.get(p["pose"], ""):
            last[p["pose"]] = p["date"]
    out = []
    for pose in POSES:
        taken = last.get(pose)
        since = _days(taken, today) if taken else None
        out.append(PhotoReminder(pose, taken, since, since is None or since >= interval_days))
    return out


@dataclass
class PhotoPair:
    before_id: str
    after_id: str
    days_between: int


def compare_pair(
    photos: Sequence[dict], pose: str, before: str | None = None, after: str | None = None
) -> PhotoPair | None:
    """Para przed/po w jednej pozie: najbliższe podanym datom, domyślnie pierwsze i ostatnie."""
    same = sorted((p for p in photos if p["pose"] == pose), key=lambda p: (p["date"], p["id"]))
    if len(same) < 2:
        return None

    def nearest(day: str) -> dict:
        return min(same, key=lambda p: (abs(_days(day, p["date"])), p["date"], p["id"]))

    a = nearest(before) if before else same[0]
    b = nearest(after) if after else same[-1]
    if a["id"] == b["id"]:
        return None
    if (a["date"], a["id"]) > (b["date"], b["id"]):
        a, b = b, a
    return PhotoPair(a["id"], b["id"], _days(a["date"], b["date"]))
