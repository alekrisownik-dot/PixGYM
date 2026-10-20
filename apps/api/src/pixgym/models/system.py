import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Identity, Index, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from pixgym.db.base import Base, CreatedAt, UUIDPk, str_enum


class SyncOp(Base):
    """Przetworzone operacje z kolejki telefonu. Ponowne wysłanie tego samego op_id nic nie robi."""

    __tablename__ = "sync_ops"

    op_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    applied_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SyncConflict(UUIDPk, CreatedAt, Base):
    """Wartość nadpisana przy konflikcie (wygrywa nowsza zmiana). Można ją przywrócić."""

    __tablename__ = "sync_conflicts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID]
    field: Mapped[str] = mapped_column(Text)
    lost_value: Mapped[Any] = mapped_column(JSONB)
    resolved_at: Mapped[datetime | None]


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index(None, "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # SET NULL: wpis zostaje po usunięciu konta, ale bez powiązania z osobą.
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class JobKind(enum.StrEnum):
    export = "export"
    import_ = "import"


class JobSource(enum.StrEnum):
    json = "json"
    csv = "csv"
    strong = "strong"
    hevy = "hevy"


class JobStatus(enum.StrEnum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


class DataJob(UUIDPk, CreatedAt, Base):
    __tablename__ = "data_jobs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[JobKind] = mapped_column(str_enum(JobKind))
    source: Mapped[JobSource] = mapped_column(str_enum(JobSource))
    status: Mapped[JobStatus] = mapped_column(
        str_enum(JobStatus), server_default=JobStatus.pending.value
    )
    error: Mapped[str | None] = mapped_column(Text)
    finished_at: Mapped[datetime | None]
