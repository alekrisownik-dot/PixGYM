from collections.abc import Iterable, Sequence
from typing import Any

from sqlalchemy import Connection, or_
from sqlalchemy.dialects.postgresql import insert


def upsert(conn: Connection, model: Any, rows: Sequence[dict[str, Any]], key: Iterable[str]) -> int:
    """INSERT ... ON CONFLICT DO UPDATE, ale tylko gdy coś się zmieniło.

    Bez warunku każdy zapis podbijałby server_version i telefony pobierałyby
    niezmienione wiersze od nowa. Zwraca liczbę faktycznie zapisanych wierszy.
    """
    if not rows:
        return 0
    table = model.__table__
    key = list(key)
    stmt = insert(table).values(list(rows))
    cols = [c for c in rows[0] if c not in key]
    result = conn.execute(
        stmt.on_conflict_do_update(
            index_elements=key,
            set_={c: stmt.excluded[c] for c in cols},
            where=or_(*(table.c[c].is_distinct_from(stmt.excluded[c]) for c in cols)),
        ).returning(table.c[key[0]])
    )
    # rowcount przy ON CONFLICT bywa -1, RETURNING zwraca dokładnie zapisane wiersze.
    return len(result.all())
