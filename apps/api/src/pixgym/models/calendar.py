import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, Text
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
