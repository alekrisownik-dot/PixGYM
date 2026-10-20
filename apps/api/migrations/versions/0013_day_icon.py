"""Dzień planu: ikonka partii (klata, plecy…) pokazywana na kole planu elastycznego.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("program_days", sa.Column("icon", sa.String(12), nullable=True))
    op.create_check_constraint(
        op.f("ck_program_days_icon"),
        "program_days",
        "icon IN ('chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_program_days_icon"), "program_days", type_="check")
    op.drop_column("program_days", "icon")
