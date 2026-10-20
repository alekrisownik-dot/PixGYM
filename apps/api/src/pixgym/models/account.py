import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    Text,
    false,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from pixgym.db.base import Base, CreatedAt, SoftDelete, UUIDPk, Versioned, str_enum


class UserRole(enum.StrEnum):
    user = "user"
    admin = "admin"


class Sex(enum.StrEnum):
    male = "male"
    female = "female"


class WeightUnit(enum.StrEnum):
    kg = "kg"
    lb = "lb"


class E1rmMethod(enum.StrEnum):
    epley = "epley"
    brzycki = "brzycki"
    rpe = "rpe"


# Talerze w parach (sztuk na stronę nie liczymy osobno): kg -> liczba par.
DEFAULT_PLATES = {"25": 4, "20": 2, "15": 2, "10": 2, "5": 2, "2.5": 2, "1.25": 2}


class User(UUIDPk, CreatedAt, SoftDelete, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("birth_year BETWEEN 1900 AND 2100", name="birth_year"),)

    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(50))
    role: Mapped[UserRole] = mapped_column(str_enum(UserRole), server_default=UserRole.user.value)
    # Płeć i rok urodzenia służą tylko do DOTS/Wilks.
    sex: Mapped[Sex | None] = mapped_column(str_enum(Sex))
    birth_year: Mapped[int | None] = mapped_column(SmallInteger)
    timezone: Mapped[str] = mapped_column(Text, server_default="Europe/Warsaw")


class UserSettings(Versioned, Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint("e1rm_max_reps BETWEEN 1 AND 20", name="e1rm_max_reps"),
        CheckConstraint("bar_weight_kg BETWEEN 0 AND 50", name="bar_weight_kg"),
        CheckConstraint("default_rest_s BETWEEN 0 AND 1800", name="default_rest_s"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    weight_unit: Mapped[WeightUnit] = mapped_column(
        str_enum(WeightUnit), server_default=WeightUnit.kg.value
    )
    e1rm_method: Mapped[E1rmMethod] = mapped_column(
        str_enum(E1rmMethod), server_default=E1rmMethod.epley.value
    )
    e1rm_max_reps: Mapped[int] = mapped_column(SmallInteger, server_default="12")
    bar_weight_kg: Mapped[Decimal] = mapped_column(Numeric(4, 2), server_default="20")
    plate_inventory: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=lambda: dict(DEFAULT_PLATES)
    )
    default_rest_s: Mapped[int] = mapped_column(SmallInteger, server_default="120")
    # Moduł sylwetki (dane o zdrowiu) działa dopiero po wyrażeniu zgody.
    body_consent_at: Mapped[datetime | None]
    # Udział w rankingu znajomych. Kto go nie włączy, nie jest widoczny i nie widzi innych.
    leaderboard_opt_in: Mapped[bool] = mapped_column(Boolean, server_default=false())


class RefreshToken(UUIDPk, CreatedAt, Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (Index(None, "user_id", "family_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Rodzina tokenów: ponowne użycie zrotowanego tokenu unieważnia całą rodzinę.
    family_id: Mapped[uuid.UUID]
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]


class MfaTotp(CreatedAt, Base):
    __tablename__ = "mfa_totp"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    secret_enc: Mapped[bytes] = mapped_column(LargeBinary)
    confirmed_at: Mapped[datetime | None]


class RecoveryCode(UUIDPk, CreatedAt, Base):
    __tablename__ = "recovery_codes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(Text)
    used_at: Mapped[datetime | None]


class Invite(CreatedAt, Base):
    """Jednorazowy kod zaproszenia. W bazie tylko hash kodu."""

    __tablename__ = "invites"

    code_hash: Mapped[str] = mapped_column(Text, primary_key=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    used_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
