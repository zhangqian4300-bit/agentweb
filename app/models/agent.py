from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Agent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agents"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(20), default="1.0.0")
    capabilities: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    pricing_per_million_tokens: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="offline", index=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    total_calls: Mapped[int] = mapped_column(Integer, default=0)
    avg_response_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_online_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    endpoint_url: Mapped[Optional[str]] = mapped_column(String(500))
    endpoint_api_key: Mapped[Optional[str]] = mapped_column(String(500))
    endpoint_protocol: Mapped[str] = mapped_column(String(20), default="openai")
    is_listed: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
