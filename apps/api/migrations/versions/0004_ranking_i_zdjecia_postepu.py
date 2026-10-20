"""Ranking znajomych i zdjęcia postępu.

Ranking łamie zasadę „każdy widzi tylko swoje”, więc tylko w jednym, wąskim miejscu:
funkcja leaderboard_entries (SECURITY DEFINER) zwraca najlepszy szacowany 1RM wyłącznie
osób z włączonym leaderboard_opt_in i tylko wtedy, gdy pytający też go włączył.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("leaderboard_opt_in", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    op.create_table(
        "progress_photos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "pose",
            sa.Enum(
                "front",
                "side",
                "back",
                "other",
                name="photopose",
                native_enum=False,
                create_constraint=False,
            ),
            server_default="front",
            nullable=False,
        ),
        sa.Column("width", sa.SmallInteger(), nullable=False),
        sa.Column("height", sa.SmallInteger(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("server_version", sa.BigInteger(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "pose IN ('front', 'side', 'back', 'other')", name=op.f("ck_progress_photos_photopose")
        ),
        sa.CheckConstraint("width > 0 AND height > 0", name=op.f("ck_progress_photos_dimensions")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_progress_photos_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_progress_photos")),
    )
    op.create_index(
        op.f("ix_progress_photos_user_id_pose_taken_at"),
        "progress_photos",
        ["user_id", "pose", "taken_at"],
    )
    op.create_index(
        op.f("ix_progress_photos_user_id_server_version"),
        "progress_photos",
        ["user_id", "server_version"],
    )

    op.execute(
        "CREATE TRIGGER progress_photos_touch BEFORE INSERT OR UPDATE ON progress_photos"
        " FOR EACH ROW EXECUTE FUNCTION pixgym_touch()"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON progress_photos TO pixgym_app")
    op.execute("ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own ON progress_photos USING (user_id = app_user_id())"
        " WITH CHECK (user_id = app_user_id())"
    )

    # Masa ciała: najnowsza z pomiarów lub z treningów. Do DOTS i rang (liczonych w Pythonie),
    # API nie zwraca jej innym użytkownikom.
    op.execute(
        """
        CREATE FUNCTION leaderboard_entries(p_exercise_id uuid)
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
                        WHERE s.user_id = u.id AND s.deleted_at IS NULL
                          AND s.bodyweight_kg IS NOT NULL
                    ) x ORDER BY x.t DESC LIMIT 1
                )
            FROM users u
            JOIN user_settings st ON st.user_id = u.id AND st.leaderboard_opt_in
            JOIN personal_records pr ON pr.user_id = u.id
                AND pr.exercise_id = p_exercise_id
                AND pr.record_type = 'e1rm'
                AND pr.superseded_at IS NULL
                AND pr.deleted_at IS NULL
            WHERE u.deleted_at IS NULL
              AND EXISTS (
                  SELECT 1 FROM user_settings me
                  WHERE me.user_id = app_user_id() AND me.leaderboard_opt_in
              )
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION leaderboard_entries(uuid) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION leaderboard_entries(uuid) TO pixgym_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION leaderboard_entries(uuid)")
    op.drop_table("progress_photos")
    op.drop_column("user_settings", "leaderboard_opt_in")
