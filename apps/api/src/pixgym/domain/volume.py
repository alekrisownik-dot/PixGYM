"""Objętość treningowa: tonaż i ciężkie serie na partię mięśniową."""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta

from pixgym.domain.e1rm import effort_rpe
from pixgym.domain.rounding import r2

# Ciężka seria: robocza, najwyżej 4 powtórzenia w zapasie.
HARD_SET_MAX_RIR = 4


@dataclass(frozen=True)
class VolumeSet:
    set_type: str
    reps: int | None
    effective_kg: float | None
    rpe: float | None = None
    rir: int | None = None
    # (slug partii, udział): główna 1.0, pomocnicza 0.5
    muscles: tuple[tuple[str, float], ...] = field(default_factory=tuple)


@dataclass
class MuscleVolume:
    hard_sets: float = 0.0
    tonnage_kg: float = 0.0


def is_hard_set(set_type: str, rpe: float | None = None, rir: int | None = None) -> bool:
    """Bez podanego RPE/RIR seria robocza liczy się jako ciężka."""
    if set_type == "warmup":
        return False
    effort = effort_rpe(rpe, rir)
    return effort is None or 10 - effort <= HARD_SET_MAX_RIR


def set_tonnage(set_type: str, effective_kg: float | None, reps: int | None) -> float:
    if set_type == "warmup" or effective_kg is None or not reps:
        return 0.0
    return r2(effective_kg * reps)


def muscle_volume(sets: Iterable[VolumeSet]) -> dict[str, MuscleVolume]:
    """Ciężkie serie liczone z udziałem partii; tonaż tylko dla partii głównych."""
    out: dict[str, MuscleVolume] = {}
    for s in sets:
        hard = is_hard_set(s.set_type, s.rpe, s.rir)
        tonnage = set_tonnage(s.set_type, s.effective_kg, s.reps)
        for slug, contribution in s.muscles:
            mv = out.setdefault(slug, MuscleVolume())
            if hard:
                mv.hard_sets += contribution
            if contribution >= 1:
                mv.tonnage_kg = r2(mv.tonnage_kg + tonnage)
    return out


def week_start(day: date) -> date:
    """Poniedziałek tygodnia (ISO), do którego należy dzień treningu."""
    return day - timedelta(days=day.weekday())
