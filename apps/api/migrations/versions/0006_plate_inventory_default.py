"""Domyślne talerze ustawiane przez bazę, nie tylko przez ORM.

Bez tego INSERT do user_settings spoza ORM-a (zwykły SQL, funkcje bazy) łamał NOT NULL.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT = """'{"25": 4, "20": 2, "15": 2, "10": 2, "5": 2, "2.5": 2, "1.25": 2}'::jsonb"""


def upgrade() -> None:
    op.alter_column("user_settings", "plate_inventory", server_default=sa.text(DEFAULT))


def downgrade() -> None:
    op.alter_column("user_settings", "plate_inventory", server_default=None)
