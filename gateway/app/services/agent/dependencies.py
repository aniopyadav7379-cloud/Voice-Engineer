"""
Lazily-constructed singletons for conversation memory and the agent
orchestrator, mirroring `get_provider_router()` from stage 1: build once,
reuse across requests, no per-request client construction cost.
"""
from qdrant_client import AsyncQdrantClient

from app.config import settings
from app.services.agent.orchestrator import AgentOrchestrator
from app.services.embeddings.mock_embedder import MockEmbedder
from app.services.memory.qdrant_memory import ConversationMemory
from app.services.provider_router import get_provider_router

_qdrant_client: AsyncQdrantClient | None = None
_memory: ConversationMemory | None = None
_orchestrator: AgentOrchestrator | None = None


def get_conversation_memory() -> ConversationMemory:
    global _qdrant_client, _memory
    if _memory is None:
        _qdrant_client = AsyncQdrantClient(location=settings.qdrant_location)
        # Real embedder (OpenAI text-embedding-3-small or similar) belongs
        # here once an API key is configured — same swap pattern as
        # provider_router's mock-vs-real provider selection.
        embedder = MockEmbedder()
        _memory = ConversationMemory(_qdrant_client, embedder)
    return _memory


def get_agent_orchestrator() -> AgentOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = AgentOrchestrator(
            memory=get_conversation_memory(),
            provider_router=get_provider_router(),
            top_k=settings.memory_top_k,
        )
    return _orchestrator
