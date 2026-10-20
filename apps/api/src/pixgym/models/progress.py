import enum
import uuid
from datetime import datetime
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
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from pixgym.db.base import Base, SoftDelete, UUIDPk, Versioned, str_enum


class RecordType(enum.StrEnum):
    one_rm = "one_rm"  # prawdziwy 1RM (seria z 1 powtórzeniem)
    e1rm = "e1rm"  # szacowany 1RM
    rep_max = "rep_max"  # najlepszy ciężar na `reps` powtórzeń (3RM, 5RM, 10RM)
    set_volume = "set_volume"  # największa seria: ciężar × powtórzenia
    bodyweight_reps = "bodyweight_reps"  # najwięcej powtórzeń bez obciążenia


class PersonalRecord(UUIDPk, Versioned, SoftDelete, Base):
    """Wiersze liczy serwer z serii (services/strength.py); ID wynika z serii i typu rekordu."""

    __tablename__ = "personal_records"
    __table_args__ = (
        ForeignKeyConstraint(
            ["set_id", "user_id"],
            ["sets.id", "sets.user_id"],
            ondelete="SET NULL (set_id)",
        ),
        CheckConstraint(
            "(record_type = 'rep_max') = (reps IS NOT NULL)", name="reps_only_for_rep_max"
        ),
        CheckConstraint("value >= 0", name="value"),
        # Dokładnie jeden aktualny rekord danego typu; pobite mają superseded_at.
        Index(
            "uq_personal_records_current",
            "user_id",
            "exercise_id",
            "record_type",
            "reps",
            unique=True,
            postgresql_where=text("superseded_at IS NULL AND deleted_at IS NULL"),
            postgresql_nulls_not_distinct=True,
        ),
        Index(None, "user_id", "server_version"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    record_type: Mapped[RecordType] = mapped_column(str_enum(RecordType))
    reps: Mapped[int | None] = mapped_column(SmallInteger)
    value: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    set_id: Mapped[uuid.UUID | None]
    achieved_at: Mapped[datetime]
    superseded_at: Mapped[datetime | None]


class BodyMeasurement(UUIDPk, Versioned, SoftDelete, Base):
    """Dane o zdrowiu (RODO art. 9): zapis wymaga user_settings.body_consent_at."""

    __tablename__ = "body_measurements"
    __table_args__ = (
        CheckConstraint("weight_kg BETWEEN 20 AND 400", name="weight_kg"),
        CheckConstraint("body_fat_pct BETWEEN 1 AND 75", name="body_fat_pct"),
        *(
            CheckConstraint(f"{c} BETWEEN 10 AND 300", name=c)
            for c in ("waist_cm", "chest_cm", "arm_cm", "thigh_cm", "hip_cm")
        ),
        Index(None, "user_id", "measured_at"),
        Index(None, "user_id", "server_version"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    measured_at: Mapped[datetime]
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    body_fat_pct: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    waist_cm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    chest_cm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    arm_cm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    thigh_cm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    hip_cm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    notes: Mapped[str | None] = mapped_column(Text)


class PhotoPose(enum.StrEnum):
    front = "front"
    side = "side"
    back = "back"
    other = "other"


class ProgressPhoto(UUIDPk, Versioned, SoftDelete, Base):
    """Zdjęcie sylwetki. Plik leży zaszyfrowany poza bazą (services/photos.py).

    Dane o zdrowiu: dodanie wymaga user_settings.body_consent_at. Po usunięciu plik
    znika od razu, wiersz zostaje jako znacznik dla synchronizacji.
    """

    __tablename__ = "progress_photos"
    __table_args__ = (
        CheckConstraint("width > 0 AND height > 0", name="dimensions"),
        Index(None, "user_id", "pose", "taken_at"),
        Index(None, "user_id", "server_version"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    taken_at: Mapped[datetime]
    pose: Mapped[PhotoPose] = mapped_column(
        str_enum(PhotoPose), server_default=PhotoPose.front.value
    )
    width: Mapped[int] = mapped_column(SmallInteger)
    height: Mapped[int] = mapped_column(SmallInteger)
    size_bytes: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
