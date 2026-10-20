"""Rekordy życiowe: wykrywanie nowych i pełna historia z listy serii."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from pixgym.domain.rounding import r2

# nRM = największy ciężar podniesiony na co najmniej n powtórzeń.
REP_MAX_TARGETS = (2, 3, 5, 8, 10, 12)

RecordKey = tuple[str, int | None]  # (record_type, reps)


@dataclass(frozen=True)
class RecordSet:
    id: str
    achieved_at: str  # ISO 8601 UTC, porównywalny jako tekst
    tracking: str
    set_type: str
    reps: int | None
    effective_kg: float | None
    e1rm_kg: float | None
    added_kg: float | None = None


@dataclass
class RecordEntry:
    record_type: str
    reps: int | None
    value: float
    set_id: str
    achieved_at: str
    superseded_at: str | None = None


def candidates(s: RecordSet) -> list[tuple[RecordKey, float]]:
    """Wszystkie wartości rekordowe, które może ustanowić dana seria."""
    if s.set_type == "warmup" or not s.reps:
        return []
    out: list[tuple[RecordKey, float]] = []
    w = s.effective_kg
    if w is not None and w > 0:
        if s.reps == 1:
            out.append((("one_rm", None), w))
        if s.e1rm_kg is not None:
            out.append((("e1rm", None), s.e1rm_kg))
        out += [(("rep_max", n), w) for n in REP_MAX_TARGETS if s.reps >= n]
        out.append((("set_volume", None), r2(w * s.reps)))
    if s.tracking == "bodyweight_reps" and not s.added_kg:
        out.append((("bodyweight_reps", None), float(s.reps)))
    return out


def new_records(best: Mapping[RecordKey, float], s: RecordSet) -> list[tuple[RecordKey, float]]:
    """Rekordy pobite przez serię. Remis nie jest rekordem."""
    return [(key, v) for key, v in candidates(s) if key not in best or v > best[key]]


def record_history(sets: Iterable[RecordSet]) -> list[RecordEntry]:
    """Historia rekordów w kolejności ustanawiania. Pobite mają superseded_at."""
    best: dict[RecordKey, float] = {}
    current: dict[RecordKey, RecordEntry] = {}
    history: list[RecordEntry] = []
    for s in sorted(sets, key=lambda s: (s.achieved_at, s.id)):
        for key, value in new_records(best, s):
            if key in current:
                current[key].superseded_at = s.achieved_at
            entry = RecordEntry(key[0], key[1], value, s.id, s.achieved_at)
            history.append(entry)
            current[key] = entry
            best[key] = value
    return history
