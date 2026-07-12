"""
Conversation memory: embeds each turn and stores it in Qdrant, then
retrieves the most relevant prior turns for the current query. This is
what lets a reply reference something said several turns ago without
stuffing the entire conversation history into every LLM prompt.

Tenant isolation is enforced at the retrieval filter, not just by
convention: every search is scoped to `tenant_id` AND `session_id` via a
Qdrant filter, not merely by relevance ranking. This matters because
retrieval is a similarity search, not an exact-match lookup — without a
hard filter, a sufficiently similar turn from a *different* tenant could
plausibly outrank a less-similar turn from the correct one, and the PRD's
"strict tenant isolation" requirement means that must be structurally
impossible, not just unlikely.
"""
import time
import uuid
from dataclasses import dataclass

from qdrant_client import AsyncQdrantClient, models

from app.services.embeddings.base import Embedder

COLLECTION_NAME = "conversation_turns"


@dataclass
class MemoryTurn:
    role: str  # "user" | "assistant"
    text: str
    language: str
    score: float | None = None


class ConversationMemory:
    def __init__(self, client: AsyncQdrantClient, embedder: Embedder):
        self._client = client
        self._embedder = embedder

    async def ensure_collection(self) -> None:
        exists = await self._client.collection_exists(COLLECTION_NAME)
        if not exists:
            await self._client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=self._embedder.dimensions,
                    distance=models.Distance.COSINE,
                ),
            )

    async def store_turn(
        self, *, tenant_id: str, session_id: str, role: str, text: str, language: str
    ) -> None:
        vector = await self._embedder.embed(text)
        await self._client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                models.PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vector,
                    payload={
                        "tenant_id": tenant_id,
                        "session_id": session_id,
                        "role": role,
                        "text": text,
                        "language": language,
                        "ts": time.time(),
                    },
                )
            ],
        )

    async def retrieve_context(
        self, *, tenant_id: str, session_id: str, query_text: str, top_k: int = 3
    ) -> list[MemoryTurn]:
        query_vector = await self._embedder.embed(query_text)

        # Hard filter, not just relevance sort — see module docstring on
        # why tenant/session isolation lives here, not upstream of it.
        tenant_filter = models.Filter(
            must=[
                models.FieldCondition(key="tenant_id", match=models.MatchValue(value=tenant_id)),
                models.FieldCondition(key="session_id", match=models.MatchValue(value=session_id)),
            ]
        )

        results = await self._client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter=tenant_filter,
            limit=top_k,
        )

        return [
            MemoryTurn(
                role=point.payload["role"],
                text=point.payload["text"],
                language=point.payload["language"],
                score=point.score,
            )
            for point in results.points
        ]
