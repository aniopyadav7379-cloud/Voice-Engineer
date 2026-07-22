"""
Real STT via Groq's Whisper endpoint, replacing MockSTT. The frontend
(hooks/use-mic-recorder.ts) captures mono 16-bit PCM at 16kHz and the
UtteranceSegmenter hands us one complete utterance's raw PCM bytes per
`transcribe()` call — but Groq's /audio/transcriptions endpoint (like
OpenAI's, which it mirrors) needs a proper audio *file*, not a bare PCM
byte stream. So this wraps the PCM in a minimal in-memory WAV container
(44-byte header + the PCM data, no external deps needed) before uploading.
"""
import io
import wave

import httpx

from app.config import settings
from app.services.voice.stt.base import STTAdapter, STTError, TranscriptResult

_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
_MODEL = "whisper-large-v3"
_SAMPLE_RATE = 16000  # must match TARGET_SAMPLE_RATE in web/src/lib/ws/pcm.ts


def _wrap_pcm_as_wav(pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(_SAMPLE_RATE)
        wav_file.writeframes(pcm)
    return buf.getvalue()


class GroqWhisperSTT(STTAdapter):
    name = "groq-whisper"

    def __init__(self, api_key: str):
        self._api_key = api_key

    async def transcribe(self, audio: bytes, *, language_hint: str | None = None) -> TranscriptResult:
        if not audio:
            return TranscriptResult(text="", confidence=0.0)

        wav_bytes = _wrap_pcm_as_wav(audio)
        headers = {"Authorization": f"Bearer {self._api_key}"}
        files = {"file": ("utterance.wav", wav_bytes, "audio/wav")}
        data = {"model": _MODEL, "response_format": "json"}
        # Whisper's `language` param BIASES recognition, it doesn't force it —
        # matches the base-class contract of detecting language switches.
        if language_hint:
            data["language"] = language_hint

        try:
            async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
                resp = await client.post(_URL, headers=headers, files=files, data=data)
            if resp.status_code >= 400:
                raise STTError(f"groq whisper returned {resp.status_code}: {resp.text[:200]}")
            payload = resp.json()
        except httpx.HTTPError as e:
            raise STTError(f"groq whisper transport error: {e}") from e

        text = (payload.get("text") or "").strip()
        if not text:
            return TranscriptResult(text="[unrecognized audio]", confidence=0.0)
        return TranscriptResult(text=text, confidence=0.9)
