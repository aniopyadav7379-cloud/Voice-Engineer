"""
Mock STT for local dev and automated tests. Real audio bytes carry no
recoverable text, so this adapter has a test-only convention: if the audio
payload happens to be valid UTF-8, it's treated *as* the transcript
directly. This lets a test harness simulate "the user said X" by sending
X.encode('utf-8') as the WebSocket binary frame instead of needing real
recorded audio fixtures for five languages. Real PCM audio (not valid
UTF-8) falls back to a fixed placeholder so the pipeline still runs.
"""
from app.services.voice.stt.base import STTAdapter, TranscriptResult


class MockSTT(STTAdapter):
    name = "mock-stt"

    async def transcribe(self, audio: bytes, *, language_hint: str | None = None) -> TranscriptResult:
        try:
            text = audio.decode("utf-8")
            if text.strip():
                return TranscriptResult(text=text, confidence=0.95)
        except UnicodeDecodeError:
            pass

        return TranscriptResult(text="[unrecognized audio]", confidence=0.0)
