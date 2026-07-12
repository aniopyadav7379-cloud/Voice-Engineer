"""
Deterministic bag-of-words hashing embedder — not a real semantic model.
Same word set always produces the same vector, and overlapping vocabulary
between two texts produces higher cosine similarity than disjoint
vocabulary. That's exactly the property retrieval tests need (store two
turns, confirm the more topically-similar one ranks higher) without
needing a real embeddings API key. It will NOT capture actual semantic
meaning (synonyms score as unrelated) — swap for a real OpenAIEmbedder
(text-embedding-3-small or similar) before this touches production
traffic; nothing downstream changes since ConversationMemory only depends
on the Embedder interface.
"""
import hashlib
import math
import re

from app.services.embeddings.base import Embedder

_WORD_RE = re.compile(r"[a-zA-Z0-9\u0900-\u0D7F]+")


class MockEmbedder(Embedder):
    name = "mock-embedder"
    dimensions = 64

    async def embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        words = _WORD_RE.findall(text.lower())

        if not words:
            return vector

        for word in words:
            digest = hashlib.sha256(word.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            vector[index] += 1.0

        norm = math.sqrt(sum(v * v for v in vector))
        if norm > 0:
            vector = [v / norm for v in vector]
        return vector
