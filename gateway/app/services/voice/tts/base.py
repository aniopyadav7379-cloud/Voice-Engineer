from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class TTSError(Exception):
    pass


class TTSAdapter(ABC):
    name: str

    @abstractmethod
    async def synthesize(self, text: str, *, language: str) -> AsyncIterator[bytes]:
        """Stream synthesized audio bytes for the given text/language."""
        raise NotImplementedError
        yield b""  # pragma: no cover
