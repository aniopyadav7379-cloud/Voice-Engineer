"""
Token-bucket rate limiter backed by Redis.

Chosen over sliding-window-log for this workload deliberately: at 100+
concurrent WebSocket sessions, a log-based limiter means one ZADD/ZREMRANGEBYSCORE
pair per request and unbounded key growth under burst traffic. A token bucket
is O(1) per check, needs one key per tenant, and — critically for voice —
naturally allows short bursts (a user rattling off a few quick utterances)
while still enforcing a steady-state rate. The trade-off is it's less precise
about *when* within a window requests land, which doesn't matter here.

The whole check-and-decrement happens in a single Lua script so it's atomic
across concurrent gateway replicas — no read-modify-write race between two
requests hitting the same tenant at once.
"""
import time

import redis.asyncio as redis

from app.config import settings

_TOKEN_BUCKET_LUA = """
-- KEYS[1] = bucket key
-- ARGV[1] = capacity (max tokens)
-- ARGV[2] = refill_per_sec
-- ARGV[3] = now (epoch seconds, float)
-- ARGV[4] = cost (tokens this request consumes)
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_sec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local bucket = redis.call("HMGET", key, "tokens", "updated_at")
local tokens = tonumber(bucket[1])
local updated_at = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  updated_at = now
end

-- refill based on elapsed time since last check
local elapsed = math.max(0, now - updated_at)
tokens = math.min(capacity, tokens + elapsed * refill_per_sec)

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "updated_at", now)
-- expire the key well past the time it'd take to fully refill, so idle
-- tenants don't leave stale keys around forever
local ttl = math.ceil(capacity / refill_per_sec) + 60
redis.call("EXPIRE", key, ttl)

return {allowed, tokens}
"""


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_hint: float):
        self.retry_after_hint = retry_after_hint
        super().__init__(f"rate limit exceeded, retry_after~{retry_after_hint:.2f}s")


class RedisTokenBucketLimiter:
    def __init__(self, redis_client: redis.Redis):
        self._redis = redis_client
        self._script = self._redis.register_script(_TOKEN_BUCKET_LUA)

    async def check(self, *, tenant_id: str, capacity: int, refill_per_sec: float, cost: int = 1) -> None:
        """Raises RateLimitExceeded if the tenant is over budget. Returns None on success."""
        key = f"ratelimit:{tenant_id}"
        now = time.time()

        allowed, tokens_remaining = await self._script(
            keys=[key],
            args=[capacity, refill_per_sec, now, cost],
        )

        if not int(allowed):
            # tokens_remaining is negative-ish distance from cost; estimate wait time
            deficit = cost - float(tokens_remaining)
            retry_after = max(deficit / refill_per_sec, 0.01)
            raise RateLimitExceeded(retry_after_hint=retry_after)


_redis_client: redis.Redis | None = None
_limiter: RedisTokenBucketLimiter | None = None


def get_rate_limiter() -> RedisTokenBucketLimiter:
    """FastAPI dependency factory. Lazily creates a single shared Redis
    connection pool for the process — do not create a new client per request."""
    global _redis_client, _limiter
    if _limiter is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=False)
        _limiter = RedisTokenBucketLimiter(_redis_client)
    return _limiter
