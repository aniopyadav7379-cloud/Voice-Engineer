from fastapi import APIRouter, Depends

from app.services.provider_router import ProviderRouter, get_provider_router

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/health/providers")
async def provider_health(provider_router: ProviderRouter = Depends(get_provider_router)) -> dict:
    """Per-provider circuit state — what your Grafana 'provider health'
    panel from the PRD's metrics dashboard would poll."""
    return await provider_router.health_snapshot()
