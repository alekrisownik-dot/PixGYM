"""Plany: tryb harmonogramu (stałe dni tygodnia albo elastyczny, w dowolne dni).

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "programs",
        sa.Column("schedule", sa.String(10), server_default="weekdays", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_programs_schedule"), "programs", "schedule IN ('weekdays', 'flexible')"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_programs_schedule"), "programs", type_="check")
    op.drop_column("programs", "schedule")
