"""Podpowiedź ciężaru na następny trening, według reguł z tabeli progression_rules.

Funkcje są czyste: dostają ostatnie wyniki (i stan, np. training max) i zwracają cel.
Skąd brać historię i gdzie trzymać stan, decyduje warstwa serwisów.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from pixgym.domain.e1rm import rts_pct
from pixgym.domain.rounding import round_to

Params = Mapping[str, Any]
DEFAULT_STEP_KG = 2.5


@dataclass(frozen=True)
class Performance:
    """Serie robocze jednego ćwiczenia z jednego treningu (ten sam ciężar)."""

    weight_kg: float
    reps: tuple[int, ...]


@dataclass
class SetTarget:
    weight_kg: float | None
    reps: int
    amrap: bool = False


def increment(params: Params, is_lower: bool) -> float:
    key = "increment_lower_kg" if is_lower else "increment_upper_kg"
    return params.get(key, params.get("increment_kg", DEFAULT_STEP_KG))


def hit_all(perf: Performance, sets: int, reps: int) -> bool:
    """Czy zrobiono co najmniej `sets` serii po co najmniej `reps` powtórzeń."""
    return len(perf.reps) >= sets and all(r >= reps for r in perf.reps[:sets])


def double_progression(
    params: Params,
    last: Performance,
    target_sets: int,
    rep_min: int,
    rep_max: int | None,
    is_lower: bool,
) -> list[SetTarget]:
    """Najpierw powtórzenia do rep_max we wszystkich seriach, potem ciężar w górę."""
    if rep_max is None:  # AMRAP: tylko powtórzenia
        return [SetTarget(last.weight_kg, rep_min, amrap=True) for _ in range(target_sets)]
    if hit_all(last, target_sets, rep_max):
        weight = round_to(last.weight_kg + increment(params, is_lower), 0.01)
        return [SetTarget(weight, rep_min) for _ in range(target_sets)]
    done = list(last.reps) + [rep_min - 1] * max(0, target_sets - len(last.reps))
    return [
        SetTarget(last.weight_kg, min(rep_max, max(rep_min, r + 1))) for r in done[:target_sets]
    ]


def linear_progression(
    params: Params,
    history: Sequence[Performance],
    target_sets: int,
    reps: int,
    is_lower: bool,
    step_kg: float = DEFAULT_STEP_KG,
) -> list[SetTarget]:
    """Każdy udany trening +increment. Po N nieudanych z rzędu na tym samym ciężarze: deload.

    history: od najstarszego do najnowszego.
    """
    last = history[-1]
    if hit_all(last, target_sets, reps):
        weight = round_to(last.weight_kg + increment(params, is_lower), 0.01)
    else:
        fails = 0
        for perf in reversed(history):
            if perf.weight_kg != last.weight_kg or hit_all(perf, target_sets, reps):
                break
            fails += 1
        if fails >= params.get("fails_before_deload", 3):
            weight = round_to(last.weight_kg * (1 - params.get("deload_pct", 0.1)), step_kg)
        else:
            weight = last.weight_kg
    return [SetTarget(weight, reps) for _ in range(target_sets)]


def rpe_target(
    params: Params,
    e1rm_kg: float,
    target_sets: int,
    rep_min: int,
    rep_max: int | None,
    target_rpe: float,
) -> list[SetTarget]:
    """Ciężar z szacowanego 1RM tak, żeby środek zakresu wypadł na docelowym RPE."""
    reps = (rep_min + rep_max) // 2 if rep_max is not None else rep_min
    pct = rts_pct(reps, target_rpe)
    step = params.get("round_to_kg", DEFAULT_STEP_KG)
    weight = round_to(e1rm_kg * pct, step) if pct is not None else None
    return [SetTarget(weight, reps) for _ in range(target_sets)]


def training_max(params: Params, e1rm_kg: float, step_kg: float = DEFAULT_STEP_KG) -> float:
    """Początkowy training max (5/3/1, nSuns): ułamek szacowanego 1RM."""
    return round_to(e1rm_kg * params.get("tm_pct", 0.9), step_kg)


def scheme_sets(
    scheme: Sequence[Mapping[str, Any]], tm_kg: float | None, step_kg: float = DEFAULT_STEP_KG
) -> list[SetTarget]:
    """Serie z program_exercises.set_scheme. Wpisy bez pct (GZCLP) nie mają ciężaru."""
    out = []
    for s in scheme:
        pct = s.get("pct")
        weight = round_to(tm_kg * pct, step_kg) if pct is not None and tm_kg else None
        out.append(SetTarget(weight, s["reps"], bool(s.get("amrap"))))
    return out


def wendler_sets(
    params: Params, tm_kg: float, week: int, step_kg: float = DEFAULT_STEP_KG
) -> list[SetTarget]:
    """Serie główne 5/3/1 dla tygodnia cyklu (0-3, trzeci indeks to deload)."""
    weeks = params["weeks"]
    return [
        SetTarget(round_to(tm_kg * pct, step_kg), reps, bool(amrap))
        for pct, reps, amrap in weeks[week % len(weeks)]
    ]


def wendler_next_tm(params: Params, tm_kg: float, is_lower: bool) -> float:
    """Training max na kolejny cykl."""
    return round_to(tm_kg + increment(params, is_lower), 0.01)


def nsuns_next_tm(params: Params, tm_kg: float, amrap_reps: int, is_lower: bool) -> float:
    """Wzrost TM zależny od powtórzeń w serii 1+ (na 95%)."""
    add = 0.0
    for step in params["amrap_increments"]:
        if amrap_reps >= step["min_reps"]:
            add = step["lower_kg"] if is_lower else step["upper_kg"]
    return round_to(tm_kg + add, 0.01)


@dataclass
class GzclpState:
    stage: int
    weight_kg: float


def gzclp_next(
    params: Params,
    state: GzclpState,
    is_lower: bool,
    success: bool | None = None,
    amrap_reps: int | None = None,
    step_kg: float = DEFAULT_STEP_KG,
) -> GzclpState:
    """Stan po treningu. T1/T2: success = wszystkie serie zrobione.

    T3: o wzroście decydują powtórzenia w ostatniej serii (amrap_reps).
    """
    if params["tier"] == 3:
        if amrap_reps is not None and amrap_reps >= params["amrap_target"]:
            return GzclpState(0, round_to(state.weight_kg + params["increment_kg"], 0.01))
        return GzclpState(0, state.weight_kg)
    if success:
        return GzclpState(
            state.stage, round_to(state.weight_kg + increment(params, is_lower), 0.01)
        )
    if state.stage + 1 < len(params["stages"]):
        return GzclpState(state.stage + 1, state.weight_kg)
    return GzclpState(0, round_to(state.weight_kg * params["reset_pct"], step_kg))


def gzclp_sets(params: Params, state: GzclpState) -> list[SetTarget]:
    """Serie dla bieżącego etapu. Ostatnia seria T1 i T3 to AMRAP."""
    if params["tier"] == 3:
        sets, reps = 3, 15
    else:
        sets, reps = params["stages"][state.stage]
    amrap_last = params["tier"] in (1, 3)
    return [SetTarget(state.weight_kg, reps, amrap_last and i == sets - 1) for i in range(sets)]
