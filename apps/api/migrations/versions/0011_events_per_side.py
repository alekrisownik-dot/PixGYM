"""Wydarzenia w kalendarzu i ciężar „na stronę” we własnych ćwiczeniach.

Ciężar w seriach zawsze zapisujemy łącznie (rekordy, 1RM i tonaż liczą się bez zmian);
per_side mówi tylko, że aplikacja pokazuje i przyjmuje go na jedną stronę (×2).

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = "('event', 'competition', 'trip', 'health', 'rest')"


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("per_side", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=80), nullable=False),
        sa.Column("kind", sa.String(length=12), server_default="event", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(f"kind IN {KINDS}", name=op.f("ck_calendar_events_kind")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_calendar_events_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_calendar_events")),
    )
    op.create_index(op.f("ix_calendar_events_user_id_date"), "calendar_events", ["user_id", "date"])
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_events TO pixgym_app")
    op.execute("ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY own ON calendar_events USING (user_id = app_user_id())"
        " WITH CHECK (user_id = app_user_id())"
    )


def downgrade() -> None:
    op.drop_table("calendar_events")
    op.drop_column("exercises", "per_side")
