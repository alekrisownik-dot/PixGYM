"""Ładuje wbudowany katalog ćwiczeń i szablony planów. Można uruchamiać wielokrotnie."""

import uuid
from collections.abc import Iterable, Sequence
from typing import Any

from sqlalchemy import Connection, delete, or_
from sqlalchemy.dialects.postgresql import insert

from pixgym.models import (
    Equipment,
    Exercise,
    ExerciseMuscle,
    MovementPattern,
    MuscleGroup,
    Program,
    ProgramDay,
    ProgramExercise,
    ProgramVersion,
    ProgressionRule,
)
from pixgym.seed.catalog_data import EQUIPMENT, EXERCISES, MOVEMENT_PATTERNS, MUSCLE_GROUPS
from pixgym.seed.programs_data import PROGRESSION_RULES, TEMPLATES

_NAMESPACE = uuid.UUID("6f1d3c2e-8b4a-4f7e-9c1d-2a5b7e9f0c31")


def builtin_id(kind: str, key: str) -> uuid.UUID:
    """Stałe ID danych wbudowanych, takie samo w każdej instalacji."""
    return uuid.uuid5(_NAMESPACE, f"{kind}:{key}")


def _upsert(conn: Connection, model: Any, rows: Sequence[dict[str, Any]], key: Iterable[str]):
    """INSERT ... ON CONFLICT DO UPDATE, ale tylko gdy coś się zmieniło.

    Bez warunku każdy start kontenera podbijałby server_version i telefony
    pobierałyby cały katalog od nowa.
    """
    if not rows:
        return
    table = model.__table__
    key = list(key)
    stmt = insert(table).values(list(rows))
    cols = [c for c in rows[0] if c not in key]
    conn.execute(
        stmt.on_conflict_do_update(
            index_elements=key,
            set_={c: stmt.excluded[c] for c in cols},
            where=or_(*(table.c[c].is_distinct_from(stmt.excluded[c]) for c in cols)),
        )
    )


def _seed_catalog(conn: Connection) -> None:
    muscles = {slug: mid for mid, slug, _, _ in MUSCLE_GROUPS}
    equipment = {slug: eid for eid, slug, _ in EQUIPMENT}
    patterns = {slug: pid for pid, slug, _ in MOVEMENT_PATTERNS}

    _upsert(
        conn,
        MuscleGroup,
        [dict(id=i, slug=s, name=n, region=r) for i, s, n, r in MUSCLE_GROUPS],
        ["id"],
    )
    _upsert(conn, Equipment, [dict(id=i, slug=s, name=n) for i, s, n in EQUIPMENT], ["id"])
    _upsert(
        conn, MovementPattern, [dict(id=i, slug=s, name=n) for i, s, n in MOVEMENT_PATTERNS], ["id"]
    )

    exercise_rows, muscle_rows = [], []
    for ex in EXERCISES:
        ex_id = builtin_id("exercise", ex.slug)
        exercise_rows.append(
            dict(
                id=ex_id,
                owner_user_id=None,
                slug=ex.slug,
                name=ex.name,
                equipment_id=equipment[ex.equipment],
                movement_pattern_id=patterns[ex.pattern] if ex.pattern else None,
                tracking=ex.tracking,
                is_unilateral=ex.unilateral,
                bw_factor=ex.bw_factor,
                deleted_at=None,
            )
        )
        for role, slugs, contribution in (
            ("primary", ex.primary, 1.0),
            ("secondary", ex.secondary, 0.5),
        ):
            muscle_rows += [
                dict(
                    exercise_id=ex_id,
                    muscle_group_id=muscles[m],
                    role=role,
                    contribution=contribution,
                )
                for m in slugs.split()
            ]
    _upsert(conn, Exercise, exercise_rows, ["id"])

    # Mięśnie nie mają wersji, więc wystarczy podmienić je w całości.
    em = ExerciseMuscle.__table__
    conn.execute(delete(em).where(em.c.exercise_id.in_([r["id"] for r in exercise_rows])))
    conn.execute(insert(em).values(muscle_rows))


def _seed_programs(conn: Connection) -> None:
    rule_ids = {r["slug"]: builtin_id("rule", r["slug"]) for r in PROGRESSION_RULES}
    _upsert(
        conn,
        ProgressionRule,
        [dict(id=rule_ids[r["slug"]], owner_user_id=None, **r) for r in PROGRESSION_RULES],
        ["id"],
    )

    for tpl in TEMPLATES:
        program_id = builtin_id("program", tpl.slug)
        version_id = builtin_id("program_version", f"{tpl.slug}:1")
        _upsert(
            conn,
            Program,
            [
                dict(
                    id=program_id,
                    owner_user_id=None,
                    slug=tpl.slug,
                    name=tpl.name,
                    description=tpl.description,
                    split=tpl.split,
                    is_template=True,
                    deleted_at=None,
                )
            ],
            ["id"],
        )
        _upsert(
            conn,
            ProgramVersion,
            [dict(id=version_id, program_id=program_id, version_no=1, is_current=True)],
            ["id"],
        )

        day_rows, ex_rows = [], []
        for day_index, day in enumerate(tpl.days):
            day_id = builtin_id("program_day", f"{tpl.slug}:{day_index}")
            day_rows.append(
                dict(id=day_id, program_version_id=version_id, day_index=day_index, name=day.name)
            )
            for position, p in enumerate(day.exercises):
                ex_rows.append(
                    dict(
                        id=builtin_id("program_exercise", f"{tpl.slug}:{day_index}:{position}"),
                        program_day_id=day_id,
                        exercise_id=builtin_id("exercise", p.exercise),
                        position=position,
                        superset_group=p.superset,
                        target_sets=p.sets,
                        rep_min=p.rep_min,
                        rep_max=p.rep_max,
                        target_rpe=p.target_rpe,
                        rest_s=p.rest_s,
                        set_scheme=p.scheme,
                        progression_rule_id=rule_ids[p.rule] if p.rule else None,
                    )
                )

        # Usuń dni i ćwiczenia, których już nie ma w szablonie.
        pd, pe = ProgramDay.__table__, ProgramExercise.__table__
        day_ids = [d["id"] for d in day_rows]
        conn.execute(
            delete(pd).where(pd.c.program_version_id == version_id, pd.c.id.notin_(day_ids))
        )
        conn.execute(
            delete(pe).where(
                pe.c.program_day_id.in_(day_ids), pe.c.id.notin_([e["id"] for e in ex_rows])
            )
        )
        _upsert(conn, ProgramDay, day_rows, ["id"])
        _upsert(conn, ProgramExercise, ex_rows, ["id"])


def seed(conn: Connection) -> None:
    _seed_catalog(conn)
    _seed_programs(conn)
