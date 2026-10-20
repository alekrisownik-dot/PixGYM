import enum
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    false,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from pixgym.db.base import Base, CreatedAt, SoftDelete, UUIDPk, Versioned, str_enum


class Region(enum.StrEnum):
    upper = "upper"
    lower = "lower"
    core = "core"


class Tracking(enum.StrEnum):
    weight_reps = "weight_reps"
    # Masa ciała + opcjonalne obciążenie (added_kg), np. podciąganie z obciążeniem.
    bodyweight_reps = "bodyweight_reps"
    duration = "duration"
    distance = "distance"


class MuscleRole(enum.StrEnum):
    primary = "primary"
    secondary = "secondary"


class MuscleGroup(Base):
    __tablename__ = "muscle_groups"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    slug: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(50))
    region: Mapped[Region] = mapped_column(str_enum(Region))


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    slug: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(50))


class MovementPattern(Base):
    __tablename__ = "movement_patterns"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    slug: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(50))


class Exercise(UUIDPk, Versioned, SoftDelete, Base):
    """owner_user_id = NULL oznacza ćwiczenie wbudowane, widoczne dla wszystkich."""

    __tablename__ = "exercises"
    __table_args__ = (
        CheckConstraint("bw_factor > 0 AND bw_factor <= 1.5", name="bw_factor"),
        CheckConstraint("video_url LIKE 'https://%'", name="video_url_https"),
        CheckConstraint("slug IS NULL OR owner_user_id IS NULL", name="slug_only_builtin"),
        Index(
            "uq_exercises_owner_name",
            "owner_user_id",
            func.lower(text("name")),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            postgresql_nulls_not_distinct=True,
        ),
        Index(None, "owner_user_id", "server_version"),
    )

    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    # Stały identyfikator ćwiczeń wbudowanych (seed, import ze Strong/Hevy).
    slug: Mapped[str | None] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"))
    movement_pattern_id: Mapped[int | None] = mapped_column(ForeignKey("movement_patterns.id"))
    tracking: Mapped[Tracking] = mapped_column(str_enum(Tracking))
    is_unilateral: Mapped[bool] = mapped_column(Boolean, server_default=false())
    # Jaka część masy ciała jest podnoszona (pompki ~0.65, podciąganie 1.0).
    bw_factor: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    video_url: Mapped[str | None] = mapped_column(Text)
    # Własne ćwiczenia: np. ustawienie maszyny („siedzisko 4, oparcie 2”).
    notes: Mapped[str | None] = mapped_column(Text)
    # Ciężar wpisywany na jedną stronę / rękę; w seriach i tak zapisany łącznie (×2).
    per_side: Mapped[bool] = mapped_column(Boolean, server_default=false())


class ExercisePhoto(UUIDPk, CreatedAt, SoftDelete, Base):
    """Zdjęcie maszyny lub stanowiska. Do dowolnego ćwiczenia (także wbudowanego), bo na
    różnych siłowniach ta sama nazwa to różne maszyny. Plik leży zaszyfrowany jak zdjęcia
    postępu (services/photos.PhotoStore), widzi go tylko właściciel."""

    __tablename__ = "exercise_photos"
    __table_args__ = (
        CheckConstraint("width > 0 AND height > 0", name="dimensions"),
        Index(None, "user_id", "exercise_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    # Np. nazwa siłowni.
    caption: Mapped[str | None] = mapped_column(String(80))
    width: Mapped[int] = mapped_column(SmallInteger)
    height: Mapped[int] = mapped_column(SmallInteger)


class ExerciseMuscle(Base):
    __tablename__ = "exercise_muscles"
    __table_args__ = (
        CheckConstraint("contribution > 0 AND contribution <= 1", name="contribution"),
    )

    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True
    )
    muscle_group_id: Mapped[int] = mapped_column(
        ForeignKey("muscle_groups.id"), primary_key=True, index=True
    )
    role: Mapped[MuscleRole] = mapped_column(str_enum(MuscleRole))
    # Udział w liczeniu ciężkich serii: główny 1.0, pomocniczy 0.5.
    contribution: Mapped[Decimal] = mapped_column(Numeric(2, 1))
