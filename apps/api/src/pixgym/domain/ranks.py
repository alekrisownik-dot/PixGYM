"""Rangi siłowe z tytułami ze świata hakowania, DOTS i kolejność w rankingu."""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from pixgym.domain.rounding import r2

TITLES = (
    "Script Kiddie",
    "Packet Sniffer",
    "Firewall Breaker",
    "Exploit Dev",
    "Black Hat",
    "Root Access",
    "Zero-Day",
    "Kernel Panic",
)


@dataclass(frozen=True)
class RankedLift:
    slug: str
    name: str
    # Szacowany 1RM / masa ciała potrzebny do rang 2..8 (ranga 1 od zera).
    thresholds: tuple[float, ...]
    # Przy ćwiczeniach z masą ciała 1.0 = jedno czyste powtórzenie. Progi kobiet skalujemy
    # tylko powyżej tej bazy, bo podciągnięcie się raz to ten sam wyczyn dla każdego.
    base: float
    female_factor: float


RANKED_LIFTS: dict[str, RankedLift] = {
    lift.slug: lift
    for lift in (
        RankedLift(
            "bench_press",
            "Wyciskanie leżąc",
            (0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0),
            0.0,
            0.65,
        ),
        RankedLift("pull_up", "Podciąganie", (1.0, 1.15, 1.3, 1.45, 1.6, 1.8, 2.0), 1.0, 0.6),
        RankedLift("dip", "Pompki na poręczach", (1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.3), 1.0, 0.6),
        RankedLift(
            "concentration_curl",
            "Uginanie w koncentracji",
            (0.1, 0.15, 0.2, 0.27, 0.35, 0.45, 0.55),
            0.0,
            0.65,
        ),
    )
}


def thresholds_for(lift: RankedLift, sex: str | None) -> list[float]:
    """Progi jako krotność masy ciała. Bez podanej płci: progi męskie."""
    if sex != "female":
        return list(lift.thresholds)
    return [
        r2(lift.base + (t - lift.base) * lift.female_factor) if t > lift.base else t
        for t in lift.thresholds
    ]


@dataclass
class Rank:
    tier: int  # 0..7
    title: str
    ratio: float  # 1RM / masa ciała
    next_title: str | None
    next_at_kg: float | None  # szacowany 1RM potrzebny do następnej rangi
    progress: float  # 0..1 w drodze do następnej rangi


def rank_for(
    lift_slug: str, e1rm_kg: float | None, bodyweight_kg: float | None, sex: str | None
) -> Rank | None:
    """Ranga dla boju albo None, gdy brak wyniku lub masy ciała."""
    lift = RANKED_LIFTS[lift_slug]
    if e1rm_kg is None or not bodyweight_kg:
        return None
    limits = [r2(t * bodyweight_kg) for t in thresholds_for(lift, sex)]
    tier = sum(1 for kg in limits if e1rm_kg >= kg)
    ratio = r2(e1rm_kg / bodyweight_kg)
    if tier == len(limits):
        return Rank(tier, TITLES[tier], ratio, None, None, 1.0)
    low = limits[tier - 1] if tier > 0 else 0.0
    high = limits[tier]
    # W dół: pasek pełny dopiero po faktycznym awansie.
    progress = math.floor(max(0.0, min(1.0, (e1rm_kg - low) / (high - low))) * 100) / 100
    return Rank(tier, TITLES[tier], ratio, TITLES[tier + 1], high, progress)


# Współczynniki DOTS (IPF): 500 / (a + b·m + c·m² + d·m³ + e·m⁴), m = masa ciała.
DOTS_COEF = {
    "male": (-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093),
    "female": (-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706),
}
DOTS_BW_RANGE = {"male": (40.0, 210.0), "female": (40.0, 150.0)}


def dots(lift_kg: float | None, bodyweight_kg: float | None, sex: str | None) -> float | None:
    """Wynik względny wobec masy ciała. Bez płci lub masy ciała: None."""
    if lift_kg is None or not bodyweight_kg or sex not in DOTS_COEF:
        return None
    lo, hi = DOTS_BW_RANGE[sex]
    m = min(max(bodyweight_kg, lo), hi)
    a, b, c, d, e = DOTS_COEF[sex]
    denominator = a + b * m + c * m**2 + d * m**3 + e * m**4
    return r2(lift_kg * 500 / denominator)


@dataclass
class Placed:
    id: str
    value: float
    achieved_at: str
    position: int


def rank_positions(entries: Sequence[dict]) -> list[Placed]:
    """Kolejność malejąco. Remis: to samo miejsce (1, 2, 2, 4), wyżej ten, kto był pierwszy."""
    valid = [e for e in entries if e["value"] is not None]
    ordered = sorted(valid, key=lambda e: (-e["value"], e["achieved_at"], e["id"]))
    out: list[Placed] = []
    for i, e in enumerate(ordered):
        position = out[-1].position if out and out[-1].value == e["value"] else i + 1
        out.append(Placed(e["id"], e["value"], e["achieved_at"], position))
    return out


def rank_table() -> list[dict]:
    """Pełna konfiguracja rang. Wektory testowe pilnują, że TypeScript ma identyczną."""
    return [
        {
            "slug": lift.slug,
            "thresholds_male": thresholds_for(lift, "male"),
            "thresholds_female": thresholds_for(lift, "female"),
            "titles": list(TITLES),
        }
        for lift in RANKED_LIFTS.values()
    ]
