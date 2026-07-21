"""
Stage 1 proof-of-life endpoint. This is deliberately NOT the WebSocket voice
endpoint from PRD section 10.1 (/v1/voice/stream) — that requires the voice
pipeline (VAD/STT/TTS) which is PRD Phase 2. What this endpoint proves is
that the full gateway chain — auth -> tenant -> rate limit -> provider
routing with failover — works end to end over plain HTTP, so Phase 2 can
plug a WebSocket handler in front of the same `provider_router` without
re-deriving any of this.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.db.models import Tenant
from app.middleware.rate_limit import enforce_rate_limit
from app.services.provider_router import AllProvidersFailedError, ProviderRouter, get_provider_router
from app.services.voice.lid import LANGUAGE_NAMES

router = APIRouter(prefix="/v1/voice", tags=["voice"])


class CompletionRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    target_language: str | None = None  # e.g. "hi" — reply in this language regardless of prompt's language


@router.post("/complete")
async def complete(
    body: CompletionRequest,
    tenant: Tenant = Depends(enforce_rate_limit),
    provider_router: ProviderRouter = Depends(get_provider_router),
):
    """Runs the request through auth -> tenant resolution -> rate limiting
    (all via the `enforce_rate_limit` dependency chain) and then streams a
    completion back, failing over across providers transparently."""
    prompt = body.prompt
    if body.target_language:
        language_name = LANGUAGE_NAMES.get(body.target_language, body.target_language)
        prompt = (
            f"Reply only in {language_name}, regardless of what language the message below is "
            f"written in. Do not add translation notes or repeat the original text — just answer "
            f"naturally in {language_name}.\n\n{body.prompt}"
        )

    try:
        provider_name, stream = await provider_router.complete(prompt)
    except AllProvidersFailedError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"All LLM providers unavailable (tried: {e.attempted})",
        ) from e

    async def sse() -> None:
        yield f"event: provider\ndata: {provider_name}\n\n".encode()
        async for chunk in stream:
            yield f"data: {chunk}\n\n".encode()
        yield b"event: done\ndata: {}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")
