"""
Voice activity detection.

Deliberately a simple RMS-energy detector, not webrtcvad or Silero. Trade-off,
stated plainly: energy-based VAD is worse in noisy environments (PRD section
15 flags this exact risk — "tuning VAD to avoid premature cut-offs in noisy
environments") and won't distinguish speech from a loud non-speech sound.
It has zero compiled dependencies, is trivially testable without audio
fixtures, and is good enough to prove the segmentation state machine below
is correct. Swapping in webrtcvad or Silero later is a one-file change —
only `is_speech()` needs to change, nothing that calls it does.

Assumes 16-bit signed PCM, mono, frames of consistent size (e.g. 20ms @
16kHz = 640 bytes). The client is responsible for framing audio this way.
"""
import audioop  # stdlib; deprecated in 3.13 but still present through 3.12/3.13 with a warning — flagged for replacement in Open Items


class EnergyVAD:
    def __init__(self, *, threshold_rms: int = 500):
        self._threshold_rms = threshold_rms

    def is_speech(self, frame: bytes) -> bool:
        if not frame:
            return False
        rms = audioop.rms(frame, 2)  # 2 bytes/sample = 16-bit PCM
        return rms >= self._threshold_rms
