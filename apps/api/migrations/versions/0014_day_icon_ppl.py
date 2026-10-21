"""Ikonki dni planu: dochodzą push, pull i góra (plany PPL i góra/dół, nie tylko split).

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-21
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = "'chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full'"
NEW = f"{OLD}, 'push', 'pull', 'upper'"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_program_days_icon"), "program_days", type_="check")
    op.create_check_constraint(op.f("ck_program_days_icon"), "program_days", f"icon IN ({NEW})")


def downgrade() -> None:
    op.execute("UPDATE program_days SET icon = NULL WHERE icon IN ('push', 'pull', 'upper')")
    op.drop_constraint(op.f("ck_program_days_icon"), "program_days", type_="check")
    op.create_check_constraint(op.f("ck_program_days_icon"), "program_days", f"icon IN ({OLD})")
