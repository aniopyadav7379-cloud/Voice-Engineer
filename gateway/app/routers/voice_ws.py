"""
PRD section 10.1: `/v1/voice/stream`, binary audio chunks + JSON control
messages. This is the real-time voice loop: VAD segments incoming audio
into utterances, STT transcribes each one, LID applies the hysteresis
model to decide whether the session's language actually changed, the
existing stage-1 provider_router produces a reply, and TTS streams audio
back — same failover/circuit-breaker behavior as the HTTP endpoint, since
it's the same ProviderRouter instance.

Rate limiting here is checked once per session start and once per
utterance turn (not per audio frame — frame-level Redis calls would blow
the latency budget for a check that should be near-free per the PRD's
<5ms target). A client sending only audio frames without ever producing a
completed utterance consumes no LLM/TTS quota — VAD gates that.

Protocol (client -> server, JSON text frames):
  {"type": "start_session", "language_hint": "en"}
  {"type": "switch_language", "language": "hi"}   # explicit user override
  {"type": "end_session"}
  <binary frames>                                  # fixed-size PCM16 audio

Protocol (server -> client):
  {"type": "session_started", "session_id": "...", "language": "en"}
  {"type": "transcript", "text": "...", "language": "en"}
  {"type": "language_switched", "language": "hi"}
  <binary frames>                                  # TTS audio for the reply
  {"type": "turn_complete"}
  {"type": "error", "detail": "..."}

All per-connection mutable state (active VoiceSession, LID, segmenter)
lives in one `_ConnectionState` instance for the lifetime of the socket —
deliberately not spread across closures or `websocket.state` attributes,
so there's exactly one place that owns "what session is this frame for."
"""
import json
import logging
from dataclasses import dataclass

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.db.models import Tenant, VoiceSession
from app.middleware.tenant import get_tenant_context_ws
from app.services.agent.dependencies import get_agent_orchestrator
from app.services.agent.orchestrator import AgentOrchestrator
from app.services.provider_router import AllProvidersFailedError
from app.services.rate_limiter import RateLimitExceeded, RedisTokenBucketLimiter, get_rate_limiter
from app.config import settings
from app.services.voice.lid import LanguageIdentifier
from app.services.voice.session_manager import SessionManager
from app.services.voice.stt.groq_whisper_stt import GroqWhisperSTT
from app.services.voice.stt.mock_stt import MockSTT
from app.services.voice.tts.mock_tts import MockTTS
from app.services.voice.utterance_buffer import UtteranceSegmenter
from app.services.voice.vad import EnergyVAD

logger = logging.getLogger("gateway.voice_ws")
router = APIRouter(prefix="/v1/voice", tags=["voice"])

# Real STT when a Groq key is configured; mock fallback keeps local dev/tests
# working with zero external dependencies, same as the LLM provider router.
# TTS is still mock-only — swap for ElevenLabs/Azure Speech by implementing
# TTSAdapter; nothing in this handler needs to change since it only depends
# on the abstract interfaces.
_stt = GroqWhisperSTT(settings.groq_api_key) if settings.groq_api_key else MockSTT()
_tts = MockTTS()


@dataclass
class _ConnectionState:
    lid: LanguageIdentifier
    segmenter: UtteranceSegmenter
    voice_session: VoiceSession | None = None
    # None means "reply in whatever language was detected/spoken" (old
    # behavior); set means "always translate the reply into this language,
    # independent of the input language".
    target_language: str | None = None


async def _check_rate_limit(limiter: RedisTokenBucketLimiter, tenant: Tenant) -> bool:
    try:
        await limiter.check(
            tenant_id=str(tenant.id),
            capacity=tenant.rate_limit_capacity,
            refill_per_sec=tenant.rate_limit_refill_per_sec,
        )
        return True
    except RateLimitExceeded:
        return False


@router.websocket("/stream")
async def voice_stream(
    websocket: WebSocket,
    tenant: Tenant = Depends(get_tenant_context_ws),
    db: AsyncSession = Depends(get_db),
    limiter: RedisTokenBucketLimiter = Depends(get_rate_limiter),
    agent: AgentOrchestrator = Depends(get_agent_orchestrator),
) -> None:
    await websocket.accept()

    if not await _check_rate_limit(limiter, tenant):
        await websocket.send_json({"type": "error", "detail": "rate limit exceeded"})
        await websocket.close(code=1008)
        return

    session_mgr = SessionManager(db)
    state = _ConnectionState(lid=LanguageIdentifier(), segmenter=UtteranceSegmenter(vad=EnergyVAD()))

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            if message.get("text") is not None:
                should_close = await _handle_control_message(
                    message["text"], websocket, tenant, session_mgr, agent, limiter, state,
                )
                if should_close:
                    break
                continue

            if message.get("bytes") is not None:
                if state.voice_session is None:
                    await websocket.send_json({"type": "error", "detail": "send start_session before audio"})
                    continue

                utterance = state.segmenter.feed(message["bytes"])
                if utterance:
                    await _process_utterance(utterance, websocket, tenant, state, session_mgr, agent, limiter)

    except WebSocketDisconnect:
        logger.info("client disconnected, tenant=%s", tenant.id)
    finally:
        if state.voice_session is not None and state.voice_session.status == "active":
            await session_mgr.end(state.voice_session)


async def _handle_control_message(
    raw: str,
    websocket: WebSocket,
    tenant: Tenant,
    session_mgr: SessionManager,
    agent: AgentOrchestrator,
    limiter: RedisTokenBucketLimiter,
    state: _ConnectionState,
) -> bool:
    """Returns True if the connection should be closed after this call."""
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        await websocket.send_json({"type": "error", "detail": "invalid JSON control message"})
        return False

    msg_type = msg.get("type")

    if msg_type == "start_session":
        if state.voice_session is not None:
            await websocket.send_json({"type": "error", "detail": "session already active"})
            return False
        language_hint = msg.get("language_hint", "en")
        state.lid.current_language = language_hint
        state.target_language = msg.get("target_language")  # optional; None = reply in spoken language
        state.voice_session = await session_mgr.start(tenant_id=tenant.id, initial_language=language_hint)
        await websocket.send_json({
            "type": "session_started",
            "session_id": str(state.voice_session.id),
            "language": language_hint,
            "target_language": state.target_language,
        })
        return False

    if msg_type == "switch_language":
        if state.voice_session is None:
            await websocket.send_json({"type": "error", "detail": "no active session"})
            return False
        language = msg.get("language", "")
        try:
            state.lid.force_language(language)
        except ValueError as e:
            await websocket.send_json({"type": "error", "detail": str(e)})
            return False

        if "target_language" in msg:
            state.target_language = msg.get("target_language")  # may be explicitly None

        pending = state.segmenter.flush_if_pending()  # don't silently drop audio mid-switch
        await session_mgr.record_language(state.voice_session, language)
        await websocket.send_json({
            "type": "language_switched",
            "language": language,
            "target_language": state.target_language,
        })
        if pending:
            await _process_utterance(pending, websocket, tenant, state, session_mgr, agent, limiter)
        return False

    if msg_type == "end_session":
        pending = state.segmenter.flush_if_pending() if state.voice_session else None
        if pending:
            await _process_utterance(pending, websocket, tenant, state, session_mgr, agent, limiter)
        if state.voice_session:
            await session_mgr.end(state.voice_session)
        await websocket.send_json({"type": "session_ended"})
        await websocket.close()
        return True

    await websocket.send_json({"type": "error", "detail": f"unknown message type: {msg_type}"})
    return False


async def _process_utterance(
    audio: bytes,
    websocket: WebSocket,
    tenant: Tenant,
    state: _ConnectionState,
    session_mgr: SessionManager,
    agent: AgentOrchestrator,
    limiter: RedisTokenBucketLimiter,
) -> None:
    if not await _check_rate_limit(limiter, tenant):
        await websocket.send_json({"type": "error", "detail": "rate limit exceeded"})
        return

    transcript = await _stt.transcribe(audio, language_hint=state.lid.current_language)
    active_language = state.lid.observe(transcript.text)

    if active_language != state.voice_session.current_language:
        await session_mgr.record_language(state.voice_session, active_language)
        await websocket.send_json({"type": "language_switched", "language": active_language})

    await websocket.send_json({"type": "transcript", "text": transcript.text, "language": active_language})

    try:
        turn = await agent.handle_turn(
            tenant_id=str(tenant.id),
            session_id=str(state.voice_session.id),
            user_text=transcript.text,
            language=active_language,
            target_language=state.target_language,
            input_language=active_language,
        )
    except AllProvidersFailedError:
        await websocket.send_json({"type": "error", "detail": "all LLM providers unavailable"})
        return

    reply_language = state.target_language or active_language
    async for audio_chunk in _tts.synthesize(turn.reply_text, language=reply_language):
        await websocket.send_bytes(audio_chunk)

    await websocket.send_json({"type": "turn_complete"})
