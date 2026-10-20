"""Ranking widoczny domyślnie; użytkownik może się ukryć.

Kto się ukryje, nie jest widoczny i sam nie widzi innych. Konto bez wiersza
user_settings liczy się jako widoczne.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FUNCTION = """
CREATE OR REPLACE FUNCTION leaderboard_entries(p_exercise_id uuid)
RETURNS TABLE (
    user_id uuid,
    display_name varchar,
    sex varchar,
    e1rm_kg numeric,
    achieved_at timestamptz,
    bodyweight_kg numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT u.id, u.display_name, u.sex, pr.value, pr.achieved_at,
        (
            SELECT x.kg FROM (
                SELECT m.weight_kg AS kg, m.measured_at AS t FROM body_measurements m
                WHERE m.user_id = u.id AND m.deleted_at IS NULL AND m.weight_kg IS NOT NULL
                UNION ALL
                SELECT s.bodyweight_kg, s.started_at FROM workout_sessions s
                WHERE s.user_id = u.id AND s.deleted_at IS NULL AND s.bodyweight_kg IS NOT NULL
            ) x ORDER BY x.t DESC LIMIT 1
        )
    FROM users u
    LEFT JOIN user_settings st ON st.user_id = u.id
    JOIN personal_records pr ON pr.user_id = u.id
        AND pr.exercise_id = p_exercise_id
        AND pr.record_type = 'e1rm'
        AND pr.superseded_at IS NULL
        AND pr.deleted_at IS NULL
    WHERE u.deleted_at IS NULL
      AND {visible}
      AND {caller_may_see}
$$
"""


# Ukryty użytkownik nie jest widoczny i nie widzi innych.
VISIBLE_BY_DEFAULT = dict(
    visible="COALESCE(st.leaderboard_visible, true)",
    caller_may_see="NOT EXISTS (SELECT 1 FROM user_settings me"
    " WHERE me.user_id = app_user_id() AND NOT me.leaderboard_visible)",
)
# Wersja z 0004: tylko jawnie włączony udział.
OPT_IN = dict(
    visible="COALESCE(st.leaderboard_opt_in, false)",
    caller_may_see="EXISTS (SELECT 1 FROM user_settings me"
    " WHERE me.user_id = app_user_id() AND me.leaderboard_opt_in)",
)


def upgrade() -> None:
    op.alter_column("user_settings", "leaderboard_opt_in", new_column_name="leaderboard_visible")
    op.alter_column("user_settings", "leaderboard_visible", server_default=sa.true())
    op.execute("UPDATE user_settings SET leaderboard_visible = true")
    op.execute(FUNCTION.format(**VISIBLE_BY_DEFAULT))


def downgrade() -> None:
    op.alter_column("user_settings", "leaderboard_visible", server_default=sa.false())
    op.alter_column("user_settings", "leaderboard_visible", new_column_name="leaderboard_opt_in")
    op.execute(FUNCTION.format(**OPT_IN))
