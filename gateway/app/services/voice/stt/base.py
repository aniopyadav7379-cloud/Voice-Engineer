"""
Uniform STT interface. One result per utterance boundary (as produced by
UtteranceSegmenter), not word-by-word partials — that's a deliberate scope
cut for stage 2. Real streaming STT services (Deepgram, Whisper streaming)
emit interim results as the user is still talking, which improves perceived
latency; wiring that through means TranscriptResult needs an `is_final`
flag and the WebSocket handler needs to forward interim results to the
client immediately. Noted as a follow-up in the README, not built here —
utterance-boundary transcription is enough to prove LID + LLM + TTS wiring
end to end first.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptResult:
    text: str
    confidence: float  # 0.0-1.0


class STTError(Exception):
    pass


class STTAdapter(ABC):
    name: str

    @abstractmethod
    async def transcribe(self, audio: bytes, *, language_hint: str | None = None) -> TranscriptResult:
        """Transcribe one complete utterance. `language_hint` is the
        currently-active session language — real providers (Deepgram,
        Whisper) use this to bias recognition, not to force it, since the
        whole point is detecting when the speaker has switched."""
        raise NotImplementedError
