"""
Uniform interface every provider adapter must implement. The router only
ever talks to this interface — adding a fifth provider later means writing
one new adapter file, not touching router logic.
"""
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class ProviderError(Exception):
    """Raised by an adapter on any failure (timeout, 5xx, auth failure, etc).
    The router treats every ProviderError the same way: count it as a
    failure against that provider's circuit breaker and try the next one."""


class ProviderAdapter(ABC):
    name: str

    @abstractmethod
    async def complete(self, prompt: str) -> AsyncIterator[str]:
        """Stream completion chunks for the given prompt. Must raise
        ProviderError (not a raw exception) on failure so the router's
        except clause can catch it uniformly."""
        raise NotImplementedError
        yield ""  # pragma: no cover - makes this an async generator for type checkers

    @abstractmethod
    async def health_check(self) -> bool:
        """Cheap liveness check used by /health/providers. Should not
        consume tokens/quota on the provider side."""
        raise NotImplementedError
