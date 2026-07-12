from abc import ABC, abstractmethod


class EmbedderError(Exception):
    pass


class Embedder(ABC):
    name: str
    dimensions: int

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError
