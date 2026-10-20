"""Plany: dni tygodnia dla dni planu i aktywny plan użytkownika.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "program_days",
        sa.Column(
            "weekdays",
            postgresql.ARRAY(sa.SmallInteger()),
            server_default=sa.text("'{}'::smallint[]"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        op.f("ck_program_days_weekdays"),
        "program_days",
        "weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]",
    )
    op.add_column("user_settings", sa.Column("active_program_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_user_settings_active_program_id_programs"),
        "user_settings",
        "programs",
        ["active_program_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_user_settings_active_program_id_programs"), "user_settings", type_="foreignkey"
    )
    op.drop_column("user_settings", "active_program_id")
    op.drop_constraint(op.f("ck_program_days_weekdays"), "program_days", type_="check")
    op.drop_column("program_days", "weekdays")
