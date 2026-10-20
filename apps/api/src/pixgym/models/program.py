import enum
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from pixgym.db.base import Base, SoftDelete, UUIDPk, Versioned, str_enum


class Split(enum.StrEnum):
    fbw = "fbw"
    upper_lower = "upper_lower"
    ppl = "ppl"
    wendler_531 = "wendler_531"
    gzclp = "gzclp"
    nsuns = "nsuns"
    custom = "custom"


class ProgressionType(enum.StrEnum):
    double = "double"
    linear = "linear"
    rpe = "rpe"
    wendler_531 = "wendler_531"
    gzclp = "gzclp"
    nsuns = "nsuns"


class ProgressionRule(UUIDPk, Versioned, Base):
    """Reguła podpowiadania ciężaru. Szczegóły w params, interpretuje je etap 2."""

    __tablename__ = "progression_rules"
    __table_args__ = (Index(None, "owner_user_id", "server_version"),)

    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    slug: Mapped[str | None] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[ProgressionType] = mapped_column(str_enum(ProgressionType))
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))


class Program(UUIDPk, Versioned, SoftDelete, Base):
    __tablename__ = "programs"
    __table_args__ = (
        # Plan bez właściciela musi być szablonem wbudowanym.
        CheckConstraint("owner_user_id IS NOT NULL OR is_template", name="builtin_is_template"),
        CheckConstraint("schedule IN ('weekdays', 'flexible')", name="schedule"),
        Index(None, "owner_user_id", "server_version"),
    )

    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    slug: Mapped[str | None] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    split: Mapped[Split] = mapped_column(str_enum(Split))
    is_template: Mapped[bool] = mapped_column(Boolean, server_default=false())
    # weekdays: dzień planu ma stałe dni tygodnia; flexible: dni robi się po kolei,
    # kiedy jest czas, a trening z danego dnia „zalicza” go w tym tygodniu.
    schedule: Mapped[str] = mapped_column(String(10), server_default="weekdays")


class ProgramVersion(UUIDPk, Versioned, Base):
    """Edycja planu tworzy nową wersję, więc stare treningi wskazują na niezmieniony plan."""

    __tablename__ = "program_versions"
    __table_args__ = (
        UniqueConstraint("program_id", "version_no"),
        Index(
            "uq_program_versions_current",
            "program_id",
            unique=True,
            postgresql_where=text("is_current"),
        ),
    )

    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))
    version_no: Mapped[int] = mapped_column(Integer)
    is_current: Mapped[bool] = mapped_column(Boolean, server_default=false())


class ProgramDay(UUIDPk, Versioned, Base):
    __tablename__ = "program_days"
    __table_args__ = (
        UniqueConstraint("program_version_id", "day_index"),
        CheckConstraint("weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]", name="weekdays"),
    )

    program_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("program_versions.id", ondelete="CASCADE")
    )
    day_index: Mapped[int] = mapped_column(SmallInteger)
    name: Mapped[str] = mapped_column(String(60))
    is_deload: Mapped[bool] = mapped_column(Boolean, server_default=false())
    # Dni tygodnia tego treningu: 0 = poniedziałek … 6 = niedziela. Pusto = bez stałego dnia.
    weekdays: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), server_default=text("'{}'::smallint[]")
    )


class ProgramExercise(UUIDPk, Versioned, Base):
    __tablename__ = "program_exercises"
    __table_args__ = (
        UniqueConstraint("program_day_id", "position"),
        CheckConstraint("target_sets BETWEEN 1 AND 20", name="target_sets"),
        CheckConstraint("rep_min BETWEEN 1 AND 100", name="rep_min"),
        CheckConstraint("rep_max BETWEEN 1 AND 100 AND rep_max >= rep_min", name="rep_max"),
        CheckConstraint(
            "target_rpe BETWEEN 1 AND 10 AND target_rpe * 2 = trunc(target_rpe * 2)",
            name="target_rpe",
        ),
        CheckConstraint(r"tempo ~ '^[0-9X]-[0-9X]-[0-9X]-[0-9X]$'", name="tempo"),
        CheckConstraint("rest_s BETWEEN 0 AND 1800", name="rest_s"),
    )

    program_day_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("program_days.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"), index=True)
    position: Mapped[int] = mapped_column(SmallInteger)
    superset_group: Mapped[int | None] = mapped_column(SmallInteger)
    target_sets: Mapped[int] = mapped_column(SmallInteger)
    # rep_max = NULL przy rep_min oznacza AMRAP (co najmniej rep_min).
    rep_min: Mapped[int | None] = mapped_column(SmallInteger)
    rep_max: Mapped[int | None] = mapped_column(SmallInteger)
    target_rpe: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    tempo: Mapped[str | None] = mapped_column(String(7))
    rest_s: Mapped[int | None] = mapped_column(SmallInteger)
    # Serie o różnym ciężarze (5/3/1 BBB, nSuns): [{"pct": 0.75, "reps": 5, "amrap": false}, ...].
    # pct to procent training maxa tego ćwiczenia albo boju podanego w "tm_of" (slug).
    set_scheme: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    progression_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("progression_rules.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
