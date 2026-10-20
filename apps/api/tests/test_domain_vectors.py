"""Wspólne przypadki z packages/test-vectors. Te same przechodzi apps/web (TypeScript)."""

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pytest

from pixgym.domain import e1rm, plates, records, volume
from pixgym.domain import progression as pg
from pixgym.seed.programs_data import PROGRESSION_RULES


def _vectors_path() -> Path:
    # W repo packages/ leży obok apps/, w kontenerze jest podmontowany pod /packages.
    for root in Path(__file__).resolve().parents:
        path = root / "packages/test-vectors/strength.json"
        if path.exists():
            return path
    raise FileNotFoundError("packages/test-vectors/strength.json")


VECTORS = json.loads(_vectors_path().read_text())
RULES = VECTORS["rules"]


def _perf(d: dict[str, Any]) -> pg.Performance:
    return pg.Performance(d["weight_kg"], tuple(d["reps"]))


def _targets(xs: list[pg.SetTarget]) -> list[dict[str, Any]]:
    return [asdict(x) for x in xs]


def _state(d: dict[str, Any]) -> pg.GzclpState:
    return pg.GzclpState(d["stage"], d["weight_kg"])


def _new_records(best: list[dict[str, Any]], set: dict[str, Any]) -> list[dict[str, Any]]:
    current = {(b["record_type"], b["reps"]): b["value"] for b in best}
    return [
        {"record_type": t, "reps": r, "value": v}
        for (t, r), v in records.new_records(current, records.RecordSet(**set))
    ]


def _muscle_volume(sets: list[dict[str, Any]]) -> dict[str, Any]:
    parsed = (
        volume.VolumeSet(**{**s, "muscles": tuple((m, c) for m, c in s["muscles"])}) for s in sets
    )
    return {k: asdict(v) for k, v in volume.muscle_volume(parsed).items()}


DISPATCH = {
    "estimate_1rm": lambda a: e1rm.estimate_1rm(**a),
    "effective_weight": lambda a: e1rm.effective_weight(**a),
    "record_history": lambda a: [
        asdict(x) for x in records.record_history(records.RecordSet(**s) for s in a["sets"])
    ],
    "new_records": lambda a: _new_records(a["best"], a["set"]),
    "is_hard_set": lambda a: volume.is_hard_set(**a),
    "muscle_volume": lambda a: _muscle_volume(a["sets"]),
    "plates_for": lambda a: asdict(plates.plates_for(**a)),
    "warmup_sets": lambda a: [asdict(x) for x in plates.warmup_sets(**a)],
    "double_progression": lambda a: _targets(
        pg.double_progression(
            RULES[a["rule"]],
            _perf(a["last"]),
            a["target_sets"],
            a["rep_min"],
            a["rep_max"],
            a["is_lower"],
        )
    ),
    "linear_progression": lambda a: _targets(
        pg.linear_progression(
            RULES[a["rule"]],
            [_perf(h) for h in a["history"]],
            a["target_sets"],
            a["reps"],
            a["is_lower"],
        )
    ),
    "rpe_target": lambda a: _targets(
        pg.rpe_target(
            RULES[a["rule"]],
            a["e1rm_kg"],
            a["target_sets"],
            a["rep_min"],
            a["rep_max"],
            a["target_rpe"],
        )
    ),
    "training_max": lambda a: pg.training_max(RULES[a["rule"]], a["e1rm_kg"]),
    "wendler_sets": lambda a: _targets(pg.wendler_sets(RULES[a["rule"]], a["tm_kg"], a["week"])),
    "wendler_next_tm": lambda a: pg.wendler_next_tm(RULES[a["rule"]], a["tm_kg"], a["is_lower"]),
    "nsuns_next_tm": lambda a: pg.nsuns_next_tm(
        RULES[a["rule"]], a["tm_kg"], a["amrap_reps"], a["is_lower"]
    ),
    "scheme_sets": lambda a: _targets(pg.scheme_sets(a["scheme"], a["tm_kg"])),
    "gzclp_next": lambda a: asdict(
        pg.gzclp_next(
            RULES[a["rule"]],
            _state(a["state"]),
            a["is_lower"],
            success=a.get("success"),
            amrap_reps=a.get("amrap_reps"),
        )
    ),
    "gzclp_sets": lambda a: _targets(pg.gzclp_sets(RULES[a["rule"]], _state(a["state"]))),
}

CASES = [
    pytest.param(fn, case, id=f"{fn}: {case['name']}")
    for fn, cases in VECTORS.items()
    if fn != "rules"
    for case in cases
]


def test_every_function_has_a_runner():
    assert set(VECTORS) - {"rules"} == set(DISPATCH)


@pytest.mark.parametrize(("fn", "case"), CASES)
def test_vector(fn, case):
    assert DISPATCH[fn](case["args"]) == case["expected"]


def test_vector_rules_match_seed():
    # Wektory testują parametry reguł z seeda. Zmiana w seedzie wymaga zmiany wektorów.
    assert {r["slug"]: r["params"] for r in PROGRESSION_RULES} == RULES
