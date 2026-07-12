"""
Language identification for the 5 supported languages, with the hysteresis
model the PRD (section 15) flags as an open question: "defining the exact
confidence threshold to prevent thrashing between languages during
code-switched speech."

Detection method: Unicode script-range matching, not a statistical LID
model. Hindi/Telugu/Tamil/Malayalam each use a distinct Unicode block, so
counting codepoints per block is a fast, dependency-free, and — for pure
script text — highly accurate detector. English defaults when no Indic
script is dominant.

What this does NOT solve: romanized code-switching ("Mujhe Hyderabad ka
weather batao" is transliterated Hindi in Latin script — this detector
sees it as English, since there's no Devanagari to match). That's a real
gap, not hidden here: the PRD's own example conversation includes exactly
this case. Closing it needs a statistical/fastText-style LID model trained
on romanized text, which is a model-integration task, not a threshold
tweak — flagged as a follow-up, not built here.

Hysteresis model (the part that IS fully implemented and tested):
- Maintain a rolling window of the last `window_size` per-utterance
  detections.
- The session's active language only changes when the newest detected
  language appears at least `min_consecutive` times in a row at the tail
  of the window AND the average confidence of those detections is >=
  `min_confidence`.
- A single low-confidence or one-off detection never flips the session
  language — this is what prevents thrashing on a single misrecognized
  word.
"""
import unicodedata
from collections import deque
from dataclasses import dataclass, field

_SCRIPT_RANGES: dict[str, tuple[int, int]] = {
    "hi": (0x0900, 0x097F),  # Devanagari
    "ta": (0x0B80, 0x0BFF),  # Tamil
    "te": (0x0C00, 0x0C7F),  # Telugu
    "ml": (0x0D00, 0x0D7F),  # Malayalam
}
SUPPORTED_LANGUAGES = {"en", "hi", "ta", "te", "ml"}


@dataclass
class LIDResult:
    language: str
    confidence: float


def detect_script_language(text: str) -> LIDResult:
    """Single-utterance detection by Unicode script majority vote.

    Denominator is letters + combining marks (not just `isalpha()`), since
    Indic vowel signs (matras) are Unicode category Mn/Mc — not
    alphabetic by Python's definition — but they fall squarely inside
    their script's block and should count as evidence for that script.
    Using letters-only as the denominator undercounts it and can push
    confidence above 1.0 for scripts that lean on combining marks.
    """
    counts: dict[str, int] = {code: 0 for code in _SCRIPT_RANGES}
    letter_like = 0

    for ch in text:
        cp = ord(ch)
        category = unicodedata.category(ch)
        is_letter_like = ch.isalpha() or category in ("Mn", "Mc")
        if is_letter_like:
            letter_like += 1
        for code, (lo, hi) in _SCRIPT_RANGES.items():
            if lo <= cp <= hi:
                counts[code] += 1
                break

    if letter_like == 0:
        return LIDResult(language="en", confidence=0.0)

    best_code, best_count = max(counts.items(), key=lambda kv: kv[1])
    if best_count == 0:
        return LIDResult(language="en", confidence=min(1.0, letter_like / max(len(text), 1)))

    return LIDResult(language=best_code, confidence=min(1.0, best_count / letter_like))


@dataclass
class LanguageIdentifier:
    window_size: int = 5
    min_consecutive: int = 2
    min_confidence: float = 0.6

    current_language: str = "en"
    _window: deque[LIDResult] = field(default_factory=lambda: deque(maxlen=5))

    def __post_init__(self) -> None:
        self._window = deque(maxlen=self.window_size)

    def observe(self, text: str) -> str:
        """Feed one utterance's transcript. Returns the session's active
        language AFTER applying hysteresis — may be unchanged even if this
        single utterance detected a different language."""
        result = detect_script_language(text)
        self._window.append(result)

        if result.language == self.current_language:
            return self.current_language

        tail = list(self._window)[-self.min_consecutive:]
        if len(tail) < self.min_consecutive:
            return self.current_language

        same_new_language = all(r.language == result.language for r in tail)
        confident_enough = (sum(r.confidence for r in tail) / len(tail)) >= self.min_confidence

        if same_new_language and confident_enough:
            self.current_language = result.language

        return self.current_language

    def force_language(self, language: str) -> None:
        """User-driven override (explicit switch_language control message) —
        bypasses hysteresis entirely, since an explicit user action isn't
        the thrashing case this model guards against."""
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"unsupported language: {language}")
        self.current_language = language
        self._window.clear()
