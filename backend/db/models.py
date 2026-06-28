"""
SQLAlchemy 2.0 models for Chronicle.

Single table — `research_results` — modeled after the build plan's spec:

    job_id PK (string, idempotent insertion key)
    query (string, the original user query)
    status (enum-ish text: queued | running | success | error)
    result (jsonb, the full ResearchData payload)
    conversation (jsonb, the agent action log used by /history)
    error (text, populated when status='error')
    created_at, updated_at (timestamps)

The `result` and `conversation` blobs are stored as JSONB so the existing
frontend types keep working without a schema migration. We can normalize
later (separate `sources`, `analysis`, `insights` tables) once we know
what queries we actually run against them.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import expression


class Base(DeclarativeBase):
    """Declarative base for all Chronicle models."""

    pass


def hash_query(query: str) -> str:
    """Normalise + hash a query for result caching.

    Normalisation: lowercase + collapse whitespace + strip. This means
    "Market size  for X" and "MARKET SIZE FOR X" map to the same hash,
    which is the right cache behaviour at our scale (no false negatives
    from formatting differences). Returns a hex SHA-256 (64 chars).
    """
    norm = " ".join(query.lower().split())
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


class ResearchResult(Base):
    __tablename__ = "research_results"

    job_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    query_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=expression.literal("queued"),
    )
    result: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )
    conversation: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("ix_research_results_created_at", "created_at"),
        Index("ix_research_results_status", "status"),
        # Cache lookup: find a recent successful row for the same query
        Index("ix_research_results_query_hash", "query_hash"),
    )

    def to_log_row(self) -> dict[str, Any]:
        """Compact shape used by the /api/conversations list endpoint."""
        return {
            "id": self.job_id,
            "timestamp": self.created_at.isoformat() if self.created_at else "",
            "query": self.query,
            "file_name": f"conversation_{self.job_id}.json",
            "file_size": len(str(self.result or "")) + len(str(self.conversation or "")),
        }

    def to_detail(self) -> dict[str, Any]:
        """Full shape used by the /api/conversations/{id} detail endpoint."""
        data: dict[str, Any] = dict(self.result or {})
        if self.conversation:
            data["conversation"] = self.conversation
        return {
            "id": self.job_id,
            "timestamp": self.created_at.isoformat() if self.created_at else "",
            "query": self.query,
            "file_name": f"conversation_{self.job_id}.json",
            "file_size": len(str(self.result or "")) + len(str(self.conversation or "")),
            "data": data,
        }
