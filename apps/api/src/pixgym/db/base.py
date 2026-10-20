import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, FetchedValue, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from pixgym.core.ids import uuid7

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {datetime: DateTime(timezone=True)}


def str_enum(cls: type[enum.StrEnum]) -> Enum:
    """Enum jako varchar + CHECK: łatwiej dodać wartość w migracji niż w natywnym typie."""
    return Enum(
        cls,
        name=cls.__name__.lower(),
        native_enum=False,
        create_constraint=True,
        length=max(len(m.value) for m in cls),
        values_callable=lambda e: [m.value for m in e],
    )


class UUIDPk:
    # ID nadaje klient (UUIDv7), więc rekord stworzony offline zachowuje je po synchronizacji.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)


class CreatedAt:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Versioned(CreatedAt):
    # updated_at i server_version ustawia trigger pixgym_touch (migracja 0002).
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
    server_version: Mapped[int] = mapped_column(
        BigInteger, server_default=FetchedValue(), server_onupdate=FetchedValue()
    )


class SoftDelete:
    deleted_at: Mapped[datetime | None]
