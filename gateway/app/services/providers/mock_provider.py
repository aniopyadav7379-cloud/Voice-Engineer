import asyncio
from collections.abc import AsyncIterator

from app.services.providers.base import ProviderAdapter


class MockProvider(ProviderAdapter):
    """Deterministic fake provider so the gateway is runnable and testable
    with zero external API keys. Wired in as the last fallback in dev config
    so `docker-compose up` works out of the box."""

    name = "mock"

    async def complete(self, prompt: str) -> AsyncIterator[str]:
        reply = f"[mock-provider] echo: {prompt}"
        for word in reply.split(" "):
            await asyncio.sleep(0.02)
            yield word + " "

    async def health_check(self) -> bool:
        return True
