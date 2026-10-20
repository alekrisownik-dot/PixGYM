"""Wbudowane reguły progresji i szablony planów.

Procenty w set_scheme odnoszą się do training maxa (TM), który liczy etap 2.
"""

from typing import Any, NamedTuple

PROGRESSION_RULES: list[dict[str, Any]] = [
    {
        "slug": "double_progression",
        "name": "Podwójna progresja",
        "type": "double",
        # Gdy wszystkie serie dojdą do rep_max, ciężar rośnie, a powtórzenia wracają do rep_min.
        "params": {"increment_upper_kg": 2.5, "increment_lower_kg": 5},
    },
    {
        "slug": "linear_progression",
        "name": "Progresja liniowa",
        "type": "linear",
        "params": {
            "increment_upper_kg": 2.5,
            "increment_lower_kg": 5,
            "fails_before_deload": 3,
            "deload_pct": 0.1,
        },
    },
    {
        "slug": "rpe_autoregulation",
        "name": "Według RPE",
        "type": "rpe",
        # Ciężar z szacowanego 1RM i tabeli RTS dla docelowego RPE.
        "params": {"round_to_kg": 2.5},
    },
    {
        "slug": "wendler_531",
        "name": "5/3/1 Wendlera",
        "type": "wendler_531",
        "params": {
            "tm_pct": 0.9,
            # Tygodnie cyklu: [procent TM, powtórzenia, czy AMRAP]. Czwarty to deload.
            "weeks": [
                [[0.65, 5, False], [0.75, 5, False], [0.85, 5, True]],
                [[0.70, 3, False], [0.80, 3, False], [0.90, 3, True]],
                [[0.75, 5, False], [0.85, 3, False], [0.95, 1, True]],
                [[0.40, 5, False], [0.50, 5, False], [0.60, 5, False]],
            ],
            "increment_upper_kg": 2.5,
            "increment_lower_kg": 5,
        },
    },
    {
        "slug": "gzclp_t1",
        "name": "GZCLP T1",
        "type": "gzclp",
        # Po nieudanej serii przejście do kolejnego etapu (serie × powtórzenia), potem reset.
        "params": {
            "tier": 1,
            "stages": [[5, 3], [6, 2], [10, 1]],
            "increment_upper_kg": 2.5,
            "increment_lower_kg": 5,
            "reset_pct": 0.85,
        },
    },
    {
        "slug": "gzclp_t2",
        "name": "GZCLP T2",
        "type": "gzclp",
        "params": {
            "tier": 2,
            "stages": [[3, 10], [3, 8], [3, 6]],
            "increment_upper_kg": 2.5,
            "increment_lower_kg": 5,
            "reset_add_kg": 7.5,
        },
    },
    {
        "slug": "gzclp_t3",
        "name": "GZCLP T3",
        "type": "gzclp",
        "params": {"tier": 3, "amrap_target": 25, "increment_kg": 2.5},
    },
    {
        "slug": "nsuns",
        "name": "nSuns LP",
        "type": "nsuns",
        # Wzrost TM zależy od powtórzeń w serii 1+ (AMRAP na 95%).
        "params": {
            "tm_pct": 0.9,
            "amrap_increments": [
                {"min_reps": 0, "upper_kg": 0, "lower_kg": 0},
                {"min_reps": 2, "upper_kg": 2.5, "lower_kg": 5},
                {"min_reps": 4, "upper_kg": 2.5, "lower_kg": 5},
                {"min_reps": 6, "upper_kg": 5, "lower_kg": 7.5},
            ],
        },
    },
]


class P(NamedTuple):
    """Ćwiczenie w dniu planu."""

    exercise: str
    sets: int
    rep_min: int | None
    rep_max: int | None  # None przy rep_min = AMRAP
    rule: str | None = None
    rest_s: int | None = None
    target_rpe: float | None = None
    scheme: list[dict[str, Any]] | None = None
    superset: int | None = None


class Day(NamedTuple):
    name: str
    exercises: list[P]


class Template(NamedTuple):
    slug: str
    name: str
    split: str
    description: str
    days: list[Day]


DP, LP = "double_progression", "linear_progression"


def scheme(*sets: tuple[float, int] | tuple[float, int, bool], tm_of: str | None = None):
    out = []
    for s in sets:
        entry: dict[str, Any] = {"pct": s[0], "reps": s[1], "amrap": len(s) > 2 and s[2]}
        if tm_of:
            entry["tm_of"] = tm_of
        out.append(entry)
    return out


def reps_scheme(*reps: int, last_amrap: bool = False):
    out = [{"reps": r, "amrap": False} for r in reps]
    out[-1]["amrap"] = last_amrap
    return out


# nSuns: T1 to główny bój dnia, T2 liczony od TM boju podanego w tm_of.
T1_BENCH_9 = scheme((0.65, 8), (0.75, 6), (0.85, 4), (0.85, 4), (0.85, 4), (0.80, 5), (0.75, 6), (0.70, 7), (0.65, 8, True))
T1_HEAVY = scheme((0.75, 5), (0.85, 3), (0.95, 1, True), (0.90, 3), (0.85, 3), (0.80, 3), (0.75, 5), (0.70, 5), (0.65, 5, True))
T1_DEADLIFT = scheme((0.75, 5), (0.85, 3), (0.95, 1, True), (0.90, 3), (0.85, 3), (0.80, 3), (0.75, 3), (0.70, 3), (0.65, 3, True))
T1_BENCH_HEAVY = scheme((0.75, 5), (0.85, 3), (0.95, 1, True), (0.90, 3), (0.85, 5), (0.80, 3), (0.75, 5), (0.70, 3), (0.65, 5, True))


def t2(base: float, tm_of: str) -> list[dict[str, Any]]:
    b, m, h = base, round(base + 0.1, 2), round(base + 0.2, 2)
    return scheme((b, 5), (m, 5), (h, 3), (h, 5), (h, 7), (h, 4), (h, 6), (h, 8), tm_of=tm_of)


BBB = scheme(*[(0.5, 10)] * 5)

TEMPLATES = [
    Template(
        "fbw_ab",
        "FBW A/B",
        "fbw",
        "Całe ciało na każdym treningu, dni A i B na zmianę, 3 razy w tygodniu. Dobry start.",
        [
            Day(
                "Trening A",
                [
                    P("back_squat", 3, 5, 8, LP, 180),
                    P("bench_press", 3, 5, 8, LP, 180),
                    P("barbell_row", 3, 6, 10, DP, 120),
                    P("lateral_raise", 3, 12, 15, DP, 60),
                    P("hanging_knee_raise", 3, 10, 15, DP, 60),
                ],
            ),
            Day(
                "Trening B",
                [
                    P("romanian_deadlift", 3, 6, 10, LP, 180),
                    P("overhead_press", 3, 5, 8, LP, 180),
                    P("pull_up", 3, 5, 10, DP, 120),
                    P("db_incline_press", 3, 8, 12, DP, 90),
                    P("ez_bar_curl", 2, 10, 15, DP, 60, superset=1),
                    P("triceps_pushdown", 2, 10, 15, DP, 60, superset=1),
                ],
            ),
        ],
    ),
    Template(
        "upper_lower",
        "Upper / Lower",
        "upper_lower",
        "4 dni: góra i dół dwa razy w tygodniu. Dzień A cięższy, dzień B więcej powtórzeń.",
        [
            Day(
                "Góra A",
                [
                    P("bench_press", 4, 4, 6, LP, 180),
                    P("barbell_row", 4, 6, 8, DP, 150),
                    P("overhead_press", 3, 6, 8, DP, 150),
                    P("lat_pulldown", 3, 8, 12, DP, 90),
                    P("ez_bar_curl", 3, 8, 12, DP, 60, superset=1),
                    P("triceps_pushdown", 3, 10, 15, DP, 60, superset=1),
                ],
            ),
            Day(
                "Dół A",
                [
                    P("back_squat", 4, 4, 6, LP, 180),
                    P("romanian_deadlift", 3, 6, 8, DP, 150),
                    P("leg_press", 3, 10, 12, DP, 120),
                    P("lying_leg_curl", 3, 10, 12, DP, 90),
                    P("standing_calf_raise", 4, 10, 15, DP, 60),
                ],
            ),
            Day(
                "Góra B",
                [
                    P("db_incline_press", 3, 8, 12, DP, 120),
                    P("chest_supported_row", 3, 8, 12, DP, 120),
                    P("db_shoulder_press", 3, 8, 12, DP, 90),
                    P("seated_cable_row", 3, 10, 12, DP, 90),
                    P("lateral_raise", 4, 12, 20, DP, 60),
                    P("incline_db_curl", 3, 10, 12, DP, 60, superset=1),
                    P("overhead_cable_extension", 3, 10, 12, DP, 60, superset=1),
                ],
            ),
            Day(
                "Dół B",
                [
                    P("deadlift", 3, 3, 5, LP, 240),
                    P("front_squat", 3, 6, 8, DP, 150),
                    P("bulgarian_split_squat", 3, 8, 12, DP, 90),
                    P("seated_leg_curl", 3, 10, 15, DP, 90),
                    P("hanging_leg_raise", 3, 8, 15, DP, 60),
                ],
            ),
        ],
    ),
    Template(
        "ppl",
        "Push / Pull / Legs",
        "ppl",
        "Pchanie, przyciąganie, nogi. 3 dni w tygodniu albo cały cykl dwa razy (6 dni).",
        [
            Day(
                "Push",
                [
                    P("bench_press", 3, 6, 8, DP, 180, 8),
                    P("overhead_press", 3, 8, 10, DP, 150, 8),
                    P("db_incline_press", 3, 10, 12, DP, 90),
                    P("lateral_raise", 4, 12, 15, DP, 60),
                    P("dip", 2, 6, None, None, 90),
                    P("triceps_pushdown", 3, 10, 15, DP, 60),
                ],
            ),
            Day(
                "Pull",
                [
                    P("deadlift", 3, 3, 5, DP, 240, 8),
                    P("pull_up", 3, 6, 10, DP, 120),
                    P("seated_cable_row", 3, 8, 12, DP, 90),
                    P("face_pull", 3, 15, 20, DP, 60),
                    P("hammer_curl", 3, 10, 12, DP, 60, superset=1),
                    P("incline_db_curl", 3, 10, 12, DP, 60, superset=1),
                ],
            ),
            Day(
                "Legs",
                [
                    P("back_squat", 3, 5, 8, DP, 180, 8),
                    P("romanian_deadlift", 3, 8, 10, DP, 150),
                    P("leg_press", 3, 10, 12, DP, 120),
                    P("lying_leg_curl", 3, 10, 15, DP, 90),
                    P("standing_calf_raise", 4, 10, 15, DP, 60),
                    P("cable_crunch", 3, 12, 15, DP, 60),
                ],
            ),
        ],
    ),
    Template(
        "wendler_531_bbb",
        "5/3/1 Boring But Big",
        "wendler_531",
        "4 dni, cykl 4-tygodniowy. Główny bój według 5/3/1, potem 5 × 10 tym samym bojem na 50% TM.",
        [
            Day(
                "OHP",
                [
                    P("overhead_press", 3, 1, 5, "wendler_531", 180),
                    P("overhead_press", 5, 10, 10, None, 90, scheme=BBB),
                    P("chin_up", 5, 5, 10, DP, 90),
                ],
            ),
            Day(
                "Martwy ciąg",
                [
                    P("deadlift", 3, 1, 5, "wendler_531", 240),
                    P("deadlift", 5, 10, 10, None, 120, scheme=BBB),
                    P("hanging_leg_raise", 5, 10, 15, DP, 60),
                ],
            ),
            Day(
                "Wyciskanie",
                [P("bench_press", 3, 1, 5, "wendler_531", 180), P("bench_press", 5, 10, 10, None, 90, scheme=BBB), P("db_row", 5, 10, 10, DP, 60)],
            ),
            Day(
                "Przysiad",
                [
                    P("back_squat", 3, 1, 5, "wendler_531", 240),
                    P("back_squat", 5, 10, 10, None, 120, scheme=BBB),
                    P("lying_leg_curl", 5, 10, 10, DP, 60),
                ],
            ),
        ],
    ),
    Template(
        "gzclp",
        "GZCLP",
        "gzclp",
        "4 dni, trzy poziomy: T1 ciężko (5 × 3+), T2 średnio (3 × 10), T3 lekko (3 × 15+).",
        [
            Day(
                "Dzień 1",
                [
                    P("back_squat", 5, 3, 3, "gzclp_t1", 240, scheme=reps_scheme(3, 3, 3, 3, 3, last_amrap=True)),
                    P("bench_press", 3, 10, 10, "gzclp_t2", 150),
                    P("lat_pulldown", 3, 15, 15, "gzclp_t3", 60, scheme=reps_scheme(15, 15, 15, last_amrap=True)),
                ],
            ),
            Day(
                "Dzień 2",
                [
                    P("overhead_press", 5, 3, 3, "gzclp_t1", 180, scheme=reps_scheme(3, 3, 3, 3, 3, last_amrap=True)),
                    P("deadlift", 3, 10, 10, "gzclp_t2", 180),
                    P("db_row", 3, 15, 15, "gzclp_t3", 60, scheme=reps_scheme(15, 15, 15, last_amrap=True)),
                ],
            ),
            Day(
                "Dzień 3",
                [
                    P("bench_press", 5, 3, 3, "gzclp_t1", 180, scheme=reps_scheme(3, 3, 3, 3, 3, last_amrap=True)),
                    P("back_squat", 3, 10, 10, "gzclp_t2", 180),
                    P("lat_pulldown", 3, 15, 15, "gzclp_t3", 60, scheme=reps_scheme(15, 15, 15, last_amrap=True)),
                ],
            ),
            Day(
                "Dzień 4",
                [
                    P("deadlift", 5, 3, 3, "gzclp_t1", 240, scheme=reps_scheme(3, 3, 3, 3, 3, last_amrap=True)),
                    P("overhead_press", 3, 10, 10, "gzclp_t2", 150),
                    P("db_row", 3, 15, 15, "gzclp_t3", 60, scheme=reps_scheme(15, 15, 15, last_amrap=True)),
                ],
            ),
        ],
    ),
    Template(
        "nsuns_5day",
        "nSuns 5 dni",
        "nsuns",
        "Wymagający plan liniowy na 5 dni: 9 serii głównego boju i 8 serii pomocniczego. "
        "TM rośnie według wyniku serii 1+.",
        [
            Day(
                "Wyciskanie / OHP",
                [
                    P("bench_press", 9, 4, 8, "nsuns", 120, scheme=T1_BENCH_9),
                    P("overhead_press", 8, 3, 8, None, 90, scheme=t2(0.5, "overhead_press")),
                    P("lat_pulldown", 3, 8, 12, DP, 60),
                    P("lateral_raise", 3, 12, 15, DP, 60),
                ],
            ),
            Day(
                "Przysiad / Sumo",
                [
                    P("back_squat", 9, 1, 5, "nsuns", 150, scheme=T1_HEAVY),
                    P("sumo_deadlift", 8, 3, 8, None, 120, scheme=t2(0.5, "deadlift")),
                    P("lying_leg_curl", 3, 10, 12, DP, 60),
                    P("hanging_leg_raise", 3, 10, 15, DP, 60),
                ],
            ),
            Day(
                "OHP / Skos",
                [
                    P("overhead_press", 9, 1, 5, "nsuns", 120, scheme=T1_HEAVY),
                    P("incline_bench_press", 8, 3, 8, None, 90, scheme=t2(0.4, "bench_press")),
                    P("pull_up", 3, 6, 10, DP, 90),
                    P("face_pull", 3, 15, 20, DP, 60),
                ],
            ),
            Day(
                "Martwy / Przedni",
                [
                    P("deadlift", 9, 1, 5, "nsuns", 180, scheme=T1_DEADLIFT),
                    P("front_squat", 8, 3, 8, None, 120, scheme=t2(0.35, "back_squat")),
                    P("barbell_row", 3, 8, 12, DP, 90),
                    P("ez_bar_curl", 3, 10, 12, DP, 60),
                ],
            ),
            Day(
                "Wyciskanie / Wąsko",
                [
                    P("bench_press", 9, 1, 5, "nsuns", 120, scheme=T1_BENCH_HEAVY),
                    P("close_grip_bench_press", 8, 3, 8, None, 90, scheme=t2(0.4, "bench_press")),
                    P("seated_cable_row", 3, 10, 12, DP, 60),
                    P("triceps_pushdown", 3, 10, 15, DP, 60),
                ],
            ),
        ],
    ),
]
