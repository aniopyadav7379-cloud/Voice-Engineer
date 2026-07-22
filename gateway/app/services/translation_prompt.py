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
    omitting both fields reproduces the old plain-prompt behavior).

    This is a TRANSLATE task, not a chat task: the model must return a
    literal translation of the user's exact words, not a conversational
    reply to them. E.g. input "hello how are you" with target=hi must come
    back as the Hindi translation of that greeting, not "main theek hoon,
    aap kaise hain" (an answer to the question)."""
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
            parts.append(
                "Translate the message below into plain English. This is a translation task, not a "
                "conversation — translate the user's exact words; do not answer them, do not respond "
                "to what they say, do not have a dialogue with them."
            )
        else:
            native_script = _NATIVE_SCRIPT_NAMES.get(target_language, "the native script")
            parts.append(
                f"Translate the message below into romanized {target_name} — spell {target_name} words "
                f"out using English/Latin letters, the way people casually text {target_name} on a "
                f"phone. Do not use {native_script} or any other native script. This is a translation "
                f"task, not a conversation: translate the user's exact words as literally and naturally "
                f"as possible. Do NOT answer the message, do NOT respond to a question in it, do NOT "
                f"have a dialogue — just output the translation of exactly what they wrote."
            )

    parts.append("Output only the translation itself — no notes, no explanations, no quotation marks, no restating the original.")
    return " ".join(parts)


def build_pure_translation_instruction(
    target_language: str | None,
    input_language: str | None = None,
) -> str:
    """For a straight translator, not a chatbot: the model must translate
    the literal text, never answer it as a question or engage with its
    content. E.g. input "hello how are you" -> output the Hindi words for
    "hello how are you", NOT a reply like "I'm fine, how are you"."""
    if not target_language and not input_language:
        return ""

    input_name = LANGUAGE_NAMES.get(input_language, input_language) if input_language else None
    target_name = LANGUAGE_NAMES.get(target_language, target_language) if target_language else "English"

    source_desc = (
        f"romanized {input_name} (spelled with English/Latin letters, not native {input_name} script)"
        if input_language and input_language != "en"
        else "English"
    )
    if target_language and target_language != "en":
        native_script = _NATIVE_SCRIPT_NAMES.get(target_language, "the native script")
        output_instruction = (
            f"Output the translation in romanized {target_name} — spell {target_name} words out using "
            f"English/Latin letters, the way people casually text {target_name} on a phone. Do not use "
            f"{native_script} or any other native script."
        )
    else:
        output_instruction = "Output the translation in plain English."

    return (
        f"You are a translation engine, not a conversational assistant. The text below is {source_desc}. "
        f"Translate it into {target_name}, preserving its meaning, tone, and register as closely as "
        f"possible. Do NOT answer it, respond to it conversationally, add information, or engage with "
        f"its content in any way — even if it reads as a question or greeting, translate it as literal "
        f"text, do not respond to it. {output_instruction} Output ONLY the translation itself — no "
        f"notes, no explanations, no quotation marks, nothing else.\n\nText to translate:"
    )
