"""
Plain-Python implementation of the retrieve -> augment -> generate ->
persist pattern that Mastra/LangGraph-style agents follow. See the note in
README about why this isn't literally a Mastra agent — Mastra has no
Python SDK, and this gateway is FastAPI/Python.

Deliberately NOT a general-purpose agent framework with tool-calling,
planning loops, etc. — the PRD's Phase 3 scope is conversation memory
integration, not an open-ended agent. Adding tool use later means
extending `handle_turn`, not replacing this class.
"""
from dataclasses import dataclass

from app.services.memory.qdrant_memory import ConversationMemory
from app.services.provider_router import AllProvidersFailedError, ProviderRouter
from app.services.translation_prompt import build_translation_instruction


@dataclass
class TurnResult:
    reply_text: str
    provider_used: str
    context_turns_used: int


class AgentOrchestrator:
    def __init__(self, memory: ConversationMemory, provider_router: ProviderRouter, *, top_k: int = 3):
        self._memory = memory
        self._provider_router = provider_router
        self._top_k = top_k

    async def handle_turn(
        self,
        *,
        tenant_id: str,
        session_id: str,
        user_text: str,
        language: str,
        target_language: str | None = None,
        input_language: str | None = None,
    ) -> TurnResult:
        # Translation mode is stateless per-message by design — pulling in
        # prior-turn context here would bias the model toward continuing a
        # conversation instead of translating this message on its own.
        if target_language:
            context_turns = []
        else:
            context_turns = await self._memory.retrieve_context(
                tenant_id=tenant_id, session_id=session_id, query_text=user_text, top_k=self._top_k,
            )

        prompt = self._build_prompt(context_turns, user_text, target_language, input_language)

        try:
            provider_name, stream = await self._provider_router.complete(prompt)
            reply_text = "".join([chunk async for chunk in stream])
        except AllProvidersFailedError:
            raise

        # Persist both sides of the turn so the next retrieval can see them.
        await self._memory.store_turn(
            tenant_id=tenant_id, session_id=session_id, role="user", text=user_text, language=language,
        )
        await self._memory.store_turn(
            tenant_id=tenant_id, session_id=session_id, role="assistant", text=reply_text, language=language,
        )

        return TurnResult(reply_text=reply_text, provider_used=provider_name, context_turns_used=len(context_turns))

    @staticmethod
    def _build_prompt(
        context_turns: list,
        user_text: str,
        target_language: str | None = None,
        input_language: str | None = None,
    ) -> str:
        if not context_turns:
            body = user_text
        else:
            # Oldest-first reads more naturally than raw similarity-score order
            ordered = sorted(context_turns, key=lambda t: t.score or 0, reverse=True)
            context_lines = "\n".join(f"{t.role}: {t.text}" for t in ordered)
            body = (
                f"Relevant context from earlier in this conversation:\n{context_lines}\n\n"
                f"Current message: {user_text}"
            )

        instruction = build_translation_instruction(target_language, input_language)
        if instruction:
            body = f"{instruction}\n\n{body}"
        return body
