"""Szacowany 1RM i ciężar efektywny serii."""

import math

from pixgym.domain.rounding import r2

# Procent 1RM przy RPE 10 dla 1..12 powtórzeń (tabela RTS). Każde powtórzenie w zapasie
# przesuwa o jedno powtórzenie, np. 5 powt. @ RPE 8 = 7 powt. @ RPE 10.
RTS_PCT = (1.0, 0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.68)

DEFAULT_MAX_REPS = 12


def rts_pct(reps: int, rpe: float) -> float | None:
    effective = reps + (10 - rpe)
    if effective < 1 or effective > len(RTS_PCT):
        return None
    lo, hi = math.floor(effective), math.ceil(effective)
    return RTS_PCT[lo - 1] + (RTS_PCT[hi - 1] - RTS_PCT[lo - 1]) * (effective - lo)


def effort_rpe(rpe: float | None, rir: int | None) -> float | None:
    """RPE z serii; jeśli podano tylko RIR, to RPE = 10 - RIR."""
    if rpe is not None:
        return rpe
    if rir is not None:
        return 10 - rir
    return None


def estimate_1rm(
    weight: float | None,
    reps: int | None,
    rpe: float | None = None,
    rir: int | None = None,
    method: str = "epley",
    max_reps: int = DEFAULT_MAX_REPS,
) -> float | None:
    """Szacowany 1RM albo None, gdy seria się nie nadaje (brak ciężaru, za dużo powtórzeń).

    method: "epley" | "brzycki" | "rpe". Przy "rpe" bez podanego wysiłku liczymy Epleyem.
    """
    if weight is None or reps is None or weight <= 0 or reps < 1 or reps > max_reps:
        return None
    if reps == 1:
        return r2(weight)
    if method == "rpe":
        effort = effort_rpe(rpe, rir)
        if effort is not None and 6 <= effort <= 10:
            pct = rts_pct(reps, effort)
            if pct is not None:
                return r2(weight / pct)
    if method == "brzycki":
        return r2(weight * 36 / (37 - reps)) if reps <= 10 else None
    return r2(weight * (1 + reps / 30))


def effective_weight(
    tracking: str,
    weight_kg: float | None,
    added_kg: float | None = None,
    bodyweight_kg: float | None = None,
    bw_factor: float | None = None,
) -> float | None:
    """Ciężar, który faktycznie poruszasz. Z masą ciała: masa × udział + obciążenie."""
    if tracking == "weight_reps":
        return r2(weight_kg) if weight_kg is not None else None
    if tracking == "bodyweight_reps":
        if bodyweight_kg is None:
            return None
        factor = bw_factor if bw_factor is not None else 1.0
        return r2(bodyweight_kg * factor + (added_kg or 0))
    return None
