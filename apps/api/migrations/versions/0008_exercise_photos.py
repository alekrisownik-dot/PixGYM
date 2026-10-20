"""Własne ćwiczenia z notatką i zdjęcia maszyn.

Zdjęcie przypina się do dowolnego ćwiczenia (także wbudowanego), bo ta sama „wyciskarka
na maszynie” wygląda inaczej na każdej siłowni. Każdy widzi tylko swoje zdjęcia (RLS).

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("exercises", sa.Column("notes", sa.Text(), nullable=True))
    op.create_table(
        "exercise_photos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("caption", sa.String(length=80), nullable=True),
        sa.Column("width", sa.SmallInteger(), nullable=False),
        sa.Column("height", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("width > 0 AND height > 0", name=op.f("ck_exercise_photos_dimensions")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_exercise_photos_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            name=op.f("fk_exercise_photos_exercise_id_exercises"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exercise_photos")),
    )
    op.create_index(
        op.f("ix_exercise_photos_user_id_exercise_id"),
        "exercise_photos",
        ["user_id", "exercise_id"],
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON exercise_photos TO pixgym_app")
    op.execute("ALTER TABLE exercise_photos ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own ON exercise_photos USING (user_id = app_user_id())"
        " WITH CHECK (user_id = app_user_id())"
    )


def downgrade() -> None:
    op.drop_table("exercise_photos")
    op.drop_column("exercises", "notes")
