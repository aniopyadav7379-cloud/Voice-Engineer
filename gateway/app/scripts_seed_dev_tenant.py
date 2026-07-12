"""
Creates one test tenant so you can exercise the auth -> tenant -> rate-limit
chain immediately after `docker-compose up`. Not part of the app runtime —
run manually: `docker-compose exec gateway python -m app.scripts_seed_dev_tenant`
"""
import asyncio
import uuid

from sqlalchemy import select

from app.db.base import AsyncSessionLocal
from app.db.models import Tenant

DEV_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(Tenant).where(Tenant.id == DEV_TENANT_ID))
        if existing.scalar_one_or_none():
            print(f"tenant already exists: {DEV_TENANT_ID}")
            return

        tenant = Tenant(
            id=DEV_TENANT_ID,
            slug="dev-tenant",
            name="Dev Test Tenant",
            quota_tier="standard",
            rate_limit_capacity=50,
            rate_limit_refill_per_sec=5.0,
            is_active=True,
        )
        session.add(tenant)
        await session.commit()
        print(f"created tenant: {DEV_TENANT_ID}")


if __name__ == "__main__":
    asyncio.run(main())
