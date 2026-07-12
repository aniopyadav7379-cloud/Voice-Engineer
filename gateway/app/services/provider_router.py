"""
Routes a completion request across providers in priority order, skipping
any provider whose circuit is currently open, and falls through to the
next one on failure — this is what makes a provider outage invisible to
the caller instead of surfacing as a dropped session.

Circuit state is in-memory per gateway process for stage 1. That's a known
scaling gap: with multiple gateway replicas, each replica trips its own
circuit independently, so a provider can look "up" to replica B while
replica A has it open. Fine for a single instance; before running >1
replica in production this state should move to Redis (same pattern as
the rate limiter) so all replicas share one view of provider health.
That's flagged here rather than built now — cheap to defer, unlike the
rate limiter's atomicity which had to be right from day one.
"""
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from app.config import settings
from app.services.providers.base import ProviderAdapter, ProviderError


@dataclass
class _CircuitState:
    consecutive_failures: int = 0
    opened_at: float | None = None

    def is_open(self) -> bool:
        if self.opened_at is None:
            return False
        if time.time() - self.opened_at >= settings.provider_circuit_reset_seconds:
            # half-open: allow one trial request through
            return False
        return True

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.consecutive_failures += 1
        if self.consecutive_failures >= settings.provider_failure_threshold:
            self.opened_at = time.time()


class AllProvidersFailedError(Exception):
    def __init__(self, attempted: list[str]):
        self.attempted = attempted
        super().__init__(f"all providers failed or were circuit-open: {attempted}")


class ProviderRouter:
    def __init__(self, adapters: list[ProviderAdapter]):
        # preserves the priority order passed in (== settings.provider_priority,
        # filtered to providers that actually have credentials configured)
        self._adapters = adapters
        self._circuits: dict[str, _CircuitState] = {a.name: _CircuitState() for a in adapters}

    async def complete(self, prompt: str) -> tuple[str, AsyncIterator[str]]:
        """Returns (provider_name_used, stream). Raises AllProvidersFailedError
        only if every provider in priority order is unavailable."""
        attempted: list[str] = []

        for adapter in self._adapters:
            circuit = self._circuits[adapter.name]
            if circuit.is_open():
                attempted.append(f"{adapter.name}(circuit-open)")
                continue

            attempted.append(adapter.name)
            try:
                # Buffer the first chunk to confirm the provider actually
                # responds before committing to it as "the" stream — this
                # is what makes failover mid-request possible rather than
                # only between requests.
                stream = adapter.complete(prompt)
                first_chunk = await stream.__anext__()
                circuit.record_success()
                return adapter.name, _prepend(first_chunk, stream)
            except (ProviderError, StopAsyncIteration) as e:
                circuit.record_failure()
                continue

        raise AllProvidersFailedError(attempted)

    async def health_snapshot(self) -> dict[str, dict]:
        snapshot = {}
        for adapter in self._adapters:
            circuit = self._circuits[adapter.name]
            snapshot[adapter.name] = {
                "circuit_open": circuit.is_open(),
                "consecutive_failures": circuit.consecutive_failures,
            }
        return snapshot


async def _prepend(first: str, rest: AsyncIterator[str]) -> AsyncIterator[str]:
    yield first
    async for chunk in rest:
        yield chunk


_router: ProviderRouter | None = None


def build_provider_router() -> ProviderRouter:
    """Constructs the router from configured credentials. Called once at
    startup; the mock provider is always appended last so the gateway is
    runnable even with zero real API keys configured."""
    from app.services.providers.mock_provider import MockProvider
    from app.services.providers.openai_provider import OpenAIProvider

    available: dict[str, ProviderAdapter] = {}
    if settings.openai_api_key:
        available["openai"] = OpenAIProvider(settings.openai_api_key)
    # groq / gemini / azure_openai adapters follow the same shape as
    # OpenAIProvider — add them here once implemented (stage 3 of the
    # PRD timeline covers full multi-provider failover testing).

    ordered = [available[name] for name in settings.provider_priority if name in available]
    ordered.append(MockProvider())  # always-available last resort
    return ProviderRouter(ordered)


def get_provider_router() -> ProviderRouter:
    global _router
    if _router is None:
        _router = build_provider_router()
    return _router
