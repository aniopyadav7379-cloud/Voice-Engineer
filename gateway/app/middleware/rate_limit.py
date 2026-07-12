"""
Stage 3: rate limiting. Reads capacity/refill from the tenant row (already
loaded in stage 2, no extra query) so quota changes take effect immediately
without touching Redis config or redeploying.
"""
from fastapi import Depends, HTTPException, Response, status

from app.db.models import Tenant
from app.middleware.tenant import get_tenant_context
from app.services.rate_limiter import RateLimitExceeded, RedisTokenBucketLimiter, get_rate_limiter


async def enforce_rate_limit(
    response: Response,
    tenant: Tenant = Depends(get_tenant_context),
    limiter: RedisTokenBucketLimiter = Depends(get_rate_limiter),
) -> Tenant:
    try:
        await limiter.check(
            tenant_id=str(tenant.id),
            capacity=tenant.rate_limit_capacity,
            refill_per_sec=tenant.rate_limit_refill_per_sec,
        )
    except RateLimitExceeded as e:
        response.headers["Retry-After"] = f"{e.retry_after_hint:.2f}"
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Tenant rate limit exceeded",
        ) from e

    return tenant
