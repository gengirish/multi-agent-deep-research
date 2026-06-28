"""
Database package — async SQLAlchemy 2.0 + asyncpg against Neon Postgres.

Public surface:
    get_engine()      -> AsyncEngine (lazy-initialised)
    get_sessionmaker()-> async_sessionmaker[AsyncSession]
    session_scope()   -> async context manager yielding an AsyncSession
    init_db()         -> create_all() on startup (idempotent)
    ResearchResult    -> SQLAlchemy model
"""

from backend.db.database import (
    dispose_engine,
    get_engine,
    get_sessionmaker,
    init_db,
    session_scope,
)
from backend.db.models import Base, ResearchResult
from backend.db.repository import (
    find_recent_successful,
    get_by_id,
    list_recent,
    upsert_result,
)

__all__ = [
    "Base",
    "ResearchResult",
    "dispose_engine",
    "find_recent_successful",
    "get_by_id",
    "get_engine",
    "get_sessionmaker",
    "init_db",
    "list_recent",
    "session_scope",
    "upsert_result",
]
