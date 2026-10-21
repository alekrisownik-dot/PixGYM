"""Szablony wydarzeń i powiadomienia push (przypomnienie dzień wcześniej, Bit pyta o trening).

- event_templates: własne szablony (emoji, rodzaj, nazwa, notatka, czy przypominać).
- calendar_events.icon / remind: emoji z szablonu i przypomnienie dzień wcześniej.
- push_subscriptions: subskrypcje Web Push (jedna na telefon/przeglądarkę).
- reminders_sent: dzień, o którym już przypomnieliśmy (żeby nie wysłać dwa razy).
- user_settings.reminder_hour / remind_workouts: kiedy wieczorem przypominać i czy pytać o trening.
- push_reminder_users(): kto ma subskrypcję (SECURITY DEFINER, bo pętla przypomnień działa
  ponad RLS; dane wydarzeń czyta potem już w transakcji danego użytkownika).

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = "('event', 'competition', 'trip', 'health', 'rest', 'workout')"


def _own(table: str) -> None:
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO pixgym_app")
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY own ON {table} USING (user_id = app_user_id())"
        " WITH CHECK (user_id = app_user_id())"
    )


def _user_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["user_id"], ["users.id"], name=op.f(f"fk_{table}_user_id_users"), ondelete="CASCADE"
    )


def _created() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def upgrade() -> None:
    op.add_column("calendar_events", sa.Column("icon", sa.String(16), nullable=True))
    op.add_column(
        "calendar_events",
        sa.Column("remind", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "user_settings",
        sa.Column("reminder_hour", sa.SmallInteger(), server_default="19", nullable=False),
    )
    op.add_column(
        "user_settings",
        sa.Column("remind_workouts", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_user_settings_reminder_hour"), "user_settings", "reminder_hour BETWEEN 0 AND 23"
    )

    op.create_table(
        "event_templates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("icon", sa.String(16), nullable=True),
        sa.Column("kind", sa.String(12), server_default="event", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("remind", sa.Boolean(), server_default=sa.true(), nullable=False),
        _created(),
        sa.CheckConstraint(f"kind IN {KINDS}", name=op.f("ck_event_templates_kind")),
        _user_fk("event_templates"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_templates")),
    )
    op.create_index(op.f("ix_event_templates_user_id"), "event_templates", ["user_id"])
    _own("event_templates")

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        _created(),
        _user_fk("push_subscriptions"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_subscriptions")),
        sa.UniqueConstraint("endpoint", name=op.f("uq_push_subscriptions_endpoint")),
    )
    op.create_index(op.f("ix_push_subscriptions_user_id"), "push_subscriptions", ["user_id"])
    _own("push_subscriptions")

    op.create_table(
        "reminders_sent",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("for_date", sa.Date(), nullable=False),
        _created(),
        _user_fk("reminders_sent"),
        sa.PrimaryKeyConstraint("user_id", "for_date", name=op.f("pk_reminders_sent")),
    )
    _own("reminders_sent")

    op.execute(
        """
        CREATE FUNCTION push_reminder_users()
        RETURNS TABLE (user_id uuid, timezone text, reminder_hour smallint)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
        AS $$
            SELECT u.id, u.timezone, s.reminder_hour
            FROM users u JOIN user_settings s ON s.user_id = u.id
            WHERE u.deleted_at IS NULL
              AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION push_reminder_users() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION push_reminder_users() TO pixgym_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION push_reminder_users()")
    op.drop_table("reminders_sent")
    op.drop_table("push_subscriptions")
    op.drop_table("event_templates")
    op.drop_constraint(op.f("ck_user_settings_reminder_hour"), "user_settings", type_="check")
    op.drop_column("user_settings", "remind_workouts")
    op.drop_column("user_settings", "reminder_hour")
    op.drop_column("calendar_events", "remind")
    op.drop_column("calendar_events", "icon")
