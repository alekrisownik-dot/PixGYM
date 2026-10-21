import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Index, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from pixgym.db.base import Base, CreatedAt, UUIDPk

EVENT_KINDS = ("event", "competition", "trip", "health", "rest", "workout")


class CalendarEvent(UUIDPk, CreatedAt, Base):
    """Własne wydarzenie w kalendarzu treningów (zawody, wyjazd, badanie…). Widzi je tylko
    właściciel (RLS)."""

    __tablename__ = "calendar_events"
    __table_args__ = (
        CheckConstraint(f"kind IN {EVENT_KINDS}", name="kind"),
        Index(None, "user_id", "date"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(12), server_default="event")
    note: Mapped[str | None] = mapped_column(Text)
    # Emoji z szablonu (zamiast ikonki rodzaju) i powiadomienie dzień wcześniej.
    icon: Mapped[str | None] = mapped_column(String(16))
    remind: Mapped[bool] = mapped_column(Boolean, server_default=true())


class EventTemplate(UUIDPk, CreatedAt, Base):
    """Własny szablon wydarzenia (np. „💆 Masaż”): jednym dotknięciem wypełnia nowe wydarzenie."""

    __tablename__ = "event_templates"
    __table_args__ = (CheckConstraint(f"kind IN {EVENT_KINDS}", name="kind"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(80))
    icon: Mapped[str | None] = mapped_column(String(16))
    kind: Mapped[str] = mapped_column(String(12), server_default="event")
    note: Mapped[str | None] = mapped_column(Text)
    remind: Mapped[bool] = mapped_column(Boolean, server_default=true())


class PushSubscription(UUIDPk, CreatedAt, Base):
    """Subskrypcja Web Push jednego telefonu (przeglądarki)."""

    __tablename__ = "push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)


class ReminderSent(CreatedAt, Base):
    """Dzień, o którym użytkownik dostał już przypomnienie (wysyłamy raz)."""

    __tablename__ = "reminders_sent"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    for_date: Mapped[date] = mapped_column(Date, primary_key=True)
