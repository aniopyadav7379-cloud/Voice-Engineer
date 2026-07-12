"""
Stage 2: tenant resolution. This is the one stage that hits Postgres, and
it's the reason tenant rows carry rate_limit_capacity/refill directly —
one indexed lookup gives auth *and* quota config in the same round trip,
instead of a second query in the rate-limit stage.
"""
from fastapi import Depends, HTTPException, WebSocketException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenPayload
from app.db.base import get_db
from app.db.models import Tenant
from app.middleware.auth import get_current_token, get_current_token_ws


async def _resolve_tenant(token: TokenPayload, db: AsyncSession) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == token.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise LookupError("unknown tenant")
    if not tenant.is_active:
        raise PermissionError("tenant is suspended")
    return tenant


async def get_tenant_context(
    token: TokenPayload = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    try:
        return await _resolve_tenant(token, db)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unknown tenant") from e
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is suspended") from e


async def get_tenant_context_ws(
    token: TokenPayload = Depends(get_current_token_ws),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    try:
        return await _resolve_tenant(token, db)
    except (LookupError, PermissionError) as e:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason=str(e)) from e
