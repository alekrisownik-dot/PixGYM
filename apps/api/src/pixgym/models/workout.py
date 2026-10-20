import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from pixgym.db.base import Base, SoftDelete, UUIDPk, Versioned, str_enum


class SetType(enum.StrEnum):
    warmup = "warmup"
    working = "working"
    drop = "drop"
    failure = "failure"
    amrap = "amrap"


class Side(enum.StrEnum):
    both = "both"
    left = "left"
    right = "right"


class WorkoutSession(UUIDPk, Versioned, SoftDelete, Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        # Cel dla złożonych kluczy obcych dzieci: dziecko musi należeć do tego samego użytkownika.
        UniqueConstraint("id", "user_id"),
        CheckConstraint("ended_at >= started_at", name="ended_after_started"),
        CheckConstraint("bodyweight_kg BETWEEN 20 AND 400", name="bodyweight_kg"),
        Index(None, "user_id", "local_date"),
        Index(None, "user_id", "server_version"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    program_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("program_versions.id", ondelete="SET NULL")
    )
    program_day_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("program_days.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime | None]
    # Dzień startu w strefie użytkownika: trening o 00:30 liczy się do poprzedniego dnia.
    local_date: Mapped[date]
    bodyweight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    notes: Mapped[str | None] = mapped_column(Text)


class SessionExercise(UUIDPk, Versioned, SoftDelete, Base):
    __tablename__ = "session_exercises"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        ForeignKeyConstraint(
            ["session_id", "user_id"],
            ["workout_sessions.id", "workout_sessions.user_id"],
            ondelete="CASCADE",
        ),
        Index(None, "session_id"),
        Index(None, "user_id", "exercise_id"),
        Index(None, "user_id", "server_version"),
    )

    # user_id jest zdenormalizowany, żeby RLS i synchronizacja nie musiały łączyć tabel.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[uuid.UUID]
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"))
    position: Mapped[int] = mapped_column(SmallInteger)
    superset_group: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None] = mapped_column(Text)


class WorkoutSet(UUIDPk, Versioned, SoftDelete, Base):
    __tablename__ = "sets"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        ForeignKeyConstraint(
            ["session_exercise_id", "user_id"],
            ["session_exercises.id", "session_exercises.user_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("weight_kg BETWEEN 0 AND 1000", name="weight_kg"),
        # Ujemne added_kg to asysta (podciąganie z gumą lub na maszynie).
        CheckConstraint("added_kg BETWEEN -300 AND 1000", name="added_kg"),
        CheckConstraint("reps BETWEEN 0 AND 100", name="reps"),
        CheckConstraint("duration_s BETWEEN 0 AND 86400", name="duration_s"),
        CheckConstraint("distance_m BETWEEN 0 AND 1000000", name="distance_m"),
        CheckConstraint("rpe BETWEEN 1 AND 10 AND rpe * 2 = trunc(rpe * 2)", name="rpe"),
        CheckConstraint("rir BETWEEN 0 AND 10", name="rir"),
        CheckConstraint("set_index BETWEEN 0 AND 100", name="set_index"),
        Index(None, "session_exercise_id"),
        Index(None, "user_id", "server_version"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    session_exercise_id: Mapped[uuid.UUID]
    set_index: Mapped[int] = mapped_column(SmallInteger)
    set_type: Mapped[SetType] = mapped_column(
        str_enum(SetType), server_default=SetType.working.value
    )
    side: Mapped[Side] = mapped_column(str_enum(Side), server_default=Side.both.value)
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    added_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    reps: Mapped[int | None] = mapped_column(SmallInteger)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    distance_m: Mapped[int | None] = mapped_column(Integer)
    rpe: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    rir: Mapped[int | None] = mapped_column(SmallInteger)
    # Liczone przez serwer (etap 2): ciężar z masą ciała oraz szacowany 1RM.
    effective_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    e1rm_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    completed_at: Mapped[datetime | None]
