"""Miękkie usuwanie rekordów.

Telefon musi się dowiedzieć o rekordzie, który zniknął po edycji lub usunięciu serii.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _current_index(where: str) -> None:
    op.create_index(
        "uq_personal_records_current",
        "personal_records",
        ["user_id", "exercise_id", "record_type", "reps"],
        unique=True,
        postgresql_where=sa.text(where),
        postgresql_nulls_not_distinct=True,
    )


def upgrade() -> None:
    op.add_column(
        "personal_records", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.drop_index("uq_personal_records_current", table_name="personal_records")
    _current_index("superseded_at IS NULL AND deleted_at IS NULL")


def downgrade() -> None:
    op.execute("DELETE FROM personal_records WHERE deleted_at IS NOT NULL")
    op.drop_index("uq_personal_records_current", table_name="personal_records")
    _current_index("superseded_at IS NULL")
    op.drop_column("personal_records", "deleted_at")
