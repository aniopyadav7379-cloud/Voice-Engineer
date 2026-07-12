"""
Mock TTS — encodes the text itself as bytes instead of real audio, so tests
can assert on what "would have been spoken" without decoding actual audio.
Swap for ElevenLabs/Azure Speech by implementing TTSAdapter; nothing else
in the pipeline needs to change since the WebSocket handler only deals in
`AsyncIterator[bytes]`.
"""
import asyncio
from collections.abc import AsyncIterator

from app.services.voice.tts.base import TTSAdapter


class MockTTS(TTSAdapter):
    name = "mock-tts"

    async def synthesize(self, text: str, *, language: str) -> AsyncIterator[bytes]:
        payload = f"[mock-tts:{language}] {text}".encode("utf-8")
        chunk_size = 32
        for i in range(0, len(payload), chunk_size):
            await asyncio.sleep(0.01)
            yield payload[i : i + chunk_size]
