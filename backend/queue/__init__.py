"""
Queue package — ARQ-based job queue + Redis pub/sub for SSE.

Exports:
    get_redis()         -> shared redis.asyncio.Redis client
    get_arq_settings()  -> RedisSettings for ARQ Queue + Worker
    enqueue_research()  -> high-level helper for the API to push a job
    progress_channel()  -> Redis pub/sub channel name for a given job_id
"""

from backend.queue.redis_client import (
    get_redis,
    get_arq_settings,
    progress_channel,
)
from backend.queue.tasks import (
    enqueue_research,
    research_job,
)

__all__ = [
    "get_redis",
    "get_arq_settings",
    "progress_channel",
    "enqueue_research",
    "research_job",
]
