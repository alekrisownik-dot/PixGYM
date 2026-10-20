"""Kalkulator talerzy i rozgrzewka."""

import math
from collections.abc import Mapping
from dataclasses import dataclass

from pixgym.domain.rounding import r2, round_to


def _grams(kg: float) -> int:
    return math.floor(kg * 1000 + 0.5)


@dataclass
class PlateLoad:
    per_side: list[float]  # od największego
    total_kg: float
    exact: bool


def plates_for(target_kg: float, bar_kg: float, inventory: Mapping[str, int]) -> PlateLoad:
    """Talerze na jedną stronę gryfu.

    inventory: ciężar talerza (tekst, jak w JSON-ie) -> liczba par. Jeśli dokładnie się nie da,
    zwraca największy możliwy ciężar poniżej celu. Przy remisie wygrywają większe talerze.
    """
    need = (_grams(target_kg) - _grams(bar_kg)) // 2
    if need <= 0:
        return PlateLoad([], r2(bar_kg), _grams(target_kg) == _grams(bar_kg))

    plates = sorted(((_grams(float(k)), n) for k, n in inventory.items() if n > 0), reverse=True)
    best_sum = -1
    best: list[int] = []
    combo: list[int] = []

    def search(i: int, remaining: int) -> bool:
        nonlocal best_sum, best
        if need - remaining > best_sum:
            best_sum, best = need - remaining, list(combo)
        if remaining == 0:
            return True
        if i == len(plates):
            return False
        weight, count = plates[i]
        for c in range(min(count, remaining // weight), -1, -1):
            combo.extend([weight] * c)
            if search(i + 1, remaining - c * weight):
                return True
            del combo[len(combo) - c :]
        return False

    search(0, need)
    return PlateLoad(
        per_side=[g / 1000 for g in best],
        total_kg=r2(bar_kg + 2 * best_sum / 1000),
        exact=best_sum == need,
    )


# (procent ciężaru roboczego, powtórzenia)
WARMUP_STEPS = ((0.4, 5), (0.6, 3), (0.8, 2))
HEAVY_EXTRA_STEP = (0.9, 1)
HEAVY_FROM_KG = 100


@dataclass
class WarmupSet:
    weight_kg: float
    reps: int


def warmup_sets(working_kg: float, bar_kg: float = 20, step_kg: float = 2.5) -> list[WarmupSet]:
    """Serie rozgrzewkowe przed ciężarem roboczym. bar_kg = 0 dla hantli i maszyn."""
    if working_kg <= bar_kg or working_kg <= 0:
        return []
    out: list[WarmupSet] = []
    if bar_kg > 0:
        out.append(WarmupSet(r2(bar_kg), 10))
    steps = WARMUP_STEPS + ((HEAVY_EXTRA_STEP,) if working_kg >= HEAVY_FROM_KG else ())
    for pct, reps in steps:
        weight = max(round_to(working_kg * pct, step_kg), r2(bar_kg))
        previous = out[-1].weight_kg if out else 0
        if previous < weight < working_kg:
            out.append(WarmupSet(weight, reps))
    return out
