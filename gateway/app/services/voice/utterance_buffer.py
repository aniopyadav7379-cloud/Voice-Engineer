"""
Turns a stream of fixed-size audio frames into discrete utterances by
watching for a run of silent frames after speech has started. This is what
lets the STT stage work on complete utterances instead of arbitrary byte
chunks — closer to how real streaming STT services expect audio delimited,
and it's the natural point to trigger LID + LLM + TTS for a turn.

State machine:
  IDLE somebody speaks     SPEAKING   enough silence     FLUSH -> back to IDLE
       -----------------> (buffering)  ----------------->

`min_speech_frames` exists so a single loud click doesn't trigger a flush —
speech has to persist for at least that many frames before it counts.
"""
from dataclasses import dataclass, field

from app.services.voice.vad import EnergyVAD


@dataclass
class UtteranceSegmenter:
    vad: EnergyVAD
    silence_frames_to_flush: int = 15   # e.g. 15 * 20ms = 300ms of silence ends an utterance
    min_speech_frames: int = 8          # 8 * 20ms = 160ms — ignore clicks/pops shorter than this
                                          # (was 3 / 60ms — too short, let noise blips through to STT,
                                          # which Whisper then "transcribes" as hallucinated phrases
                                          # like "Thank you." instead of returning nothing)

    _buffer: list[bytes] = field(default_factory=list)
    _speech_frame_count: int = 0
    _silence_run: int = 0
    _in_speech: bool = False

    def feed(self, frame: bytes) -> bytes | None:
        """Feed one frame. Returns the complete utterance (joined bytes) if
        this frame completed one, otherwise None."""
        speech = self.vad.is_speech(frame)

        if speech:
            self._buffer.append(frame)
            self._speech_frame_count += 1
            self._silence_run = 0
            if self._speech_frame_count >= self.min_speech_frames:
                self._in_speech = True
            return None

        # silent frame
        if self._in_speech:
            self._buffer.append(frame)  # keep trailing silence, it's cheap and helps STT
            self._silence_run += 1
            if self._silence_run >= self.silence_frames_to_flush:
                return self._flush()
            return None

        # silence before speech ever started — nothing to do, drop the frame
        self._buffer.clear()
        self._speech_frame_count = 0
        return None

    def flush_if_pending(self) -> bytes | None:
        """Call on session end / switch_language to force out a partial
        utterance rather than silently dropping trailing audio."""
        if self._in_speech and self._buffer:
            return self._flush()
        return None

    def _flush(self) -> bytes:
        utterance = b"".join(self._buffer)
        self._buffer = []
        self._speech_frame_count = 0
        self._silence_run = 0
        self._in_speech = False
        return utterance
