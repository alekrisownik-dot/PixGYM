"""Limit prób w oknie czasowym (Redis). Gdy Redis nie działa, limit się nie stosuje,
żeby awaria Redisa nie blokowała logowania."""

import logging

import redis.asyncio as redis
from redis.exceptions import RedisError

from pixgym.core.config import get_settings

log = logging.getLogger(__name__)


def _client() -> redis.Redis:
    # Nowe połączenie na wywołanie: limity dotyczą tylko logowania, więc to tanie,
    # a klient nie jest przywiązany do jednej pętli zdarzeń.
    return redis.from_url(get_settings().redis_url, socket_timeout=2)


async def hit(key: str, limit: int, window_s: int) -> bool:
    """Liczy próbę. False, gdy przekroczono limit."""
    full = f"rl:{key}"
    try:
        async with _client() as r:
            count, _ = await r.pipeline().incr(full).expire(full, window_s, nx=True).execute()
        return count <= limit
    except RedisError:
        log.warning("Redis niedostępny, limit %s pominięty", key)
        return True


async def reset(key: str) -> None:
    try:
        async with _client() as r:
            await r.delete(f"rl:{key}")
    except RedisError:
        pass
