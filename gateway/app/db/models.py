import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Tenant(Base):
    """
    A tenant = one enterprise customer. Quota fields here override the
    global defaults in Settings; the rate limiter reads capacity/refill
    from this row, not from config, so quotas can change without a deploy.
    """

    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quota_tier: Mapped[str] = mapped_column(String(32), nullable=False, default="standard")

    rate_limit_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    rate_limit_refill_per_sec: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sessions: Mapped[list["VoiceSession"]] = relationship(back_populates="tenant")


class VoiceSession(Base):
    """One live or completed voice conversation. Language changes mid-call
    are tracked in `language_history`, not overwritten in place, so LID
    accuracy can be audited after the fact."""

    __tablename__ = "voice_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)

    current_language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    language_history: Mapped[str] = mapped_column(String, nullable=False, default="en")  # comma-separated codes
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active|closed|error

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="sessions")
