"""
Shared prompt-engineering helper for cross-language replies. Both the HTTP
completion endpoint (routers/voice.py) and the voice pipeline
(services/agent/orchestrator.py) need the exact same instruction text, so
it lives in one place instead of being duplicated.

Two independent knobs:
- `input_language`: what language the user's message is actually written
  in (as romanized/Latin-script text, e.g. "Nenu ela unnanu?" for Telugu).
  Purely a hint for the model — nothing here does script detection or
  transliteration itself.
- `target_language`: what language (and script) the reply should be in.

Default reply style is ROMANIZED (Latin-script phonetic spelling), not the
native Indic script — e.g. "Neenga eppadi irukeenga?" not "நீங்க எப்படி
இருக்கீங்க?". This matches how people actually text in these languages day
to day, and sidesteps the gateway's script-based language detector, which
only recognizes native scripts and always sees Latin-script text as
English (see services/voice/lid.py's module docstring on romanized
code-switching).
"""
from app.services.voice.lid import LANGUAGE_NAMES

_NATIVE_SCRIPT_NAMES = {
    "hi": "Devanagari",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
}


def build_translation_instruction(
    target_language: str | None,
    input_language: str | None = None,
) -> str:
    """Returns an instruction string to prepend to the user's message, or
    "" if no language handling was requested (fully backward compatible —
    omitting both fields reproduces the old plain-prompt behavior)."""
    if not target_language and not input_language:
        return ""

    parts: list[str] = []

    if input_language and input_language != "en":
        input_name = LANGUAGE_NAMES.get(input_language, input_language)
        parts.append(
            f"The message below is written in romanized {input_name} — {input_name} words spelled "
            f"out using English/Latin letters, not native {input_name} script. Read it as {input_name}."
        )

    if target_language:
        target_name = LANGUAGE_NAMES.get(target_language, target_language)
        if target_language == "en":
            parts.append("Reply only in English.")
        else:
            native_script = _NATIVE_SCRIPT_NAMES.get(target_language, "the native script")
            parts.append(
                f"Reply only in romanized {target_name} — spell {target_name} words out using "
                f"English/Latin letters, the way people casually text {target_name} on a phone. "
                f"Do not use {native_script} or any other native script."
            )

    parts.append("Do not add translation notes or explanations, and do not repeat the original text — just answer naturally.")
    return " ".join(parts)
