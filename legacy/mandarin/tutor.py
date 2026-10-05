"""LLM conversation layer.

Two separate calls per turn:
  reply()   - the tutor's natural chat response.
  analyze() - grades the student's message and pulls out new vocabulary.

Splitting them keeps the chat fluent while a second call does the grading. The analyzer uses structured outputs so the JSON is valid.
Credentials come from ANTHROPIC_API_KEY (or an `ant auth login` profile).
"""

from __future__ import annotations

import json

import anthropic

MODEL = "claude-opus-4-8"

AUTH_HINT = (
    "No Anthropic credentials found. Set ANTHROPIC_API_KEY in your environment "
    "(export ANTHROPIC_API_KEY=sk-ant-...), then run `mandarin chat` again."
)

# ---- Pass A: the tutor persona ----

TUTOR_BASE = """You are 老师 (Lǎoshī), a patient Mandarin conversation partner.
Keep replies short (2-4 sentences) and end with a question so the conversation
keeps going. Be encouraging. Do NOT correct the student's mistakes yourself; a
separate system handles that. Model good, natural Chinese.
"""

LEVELS = {
    "easy": """Level: beginner (HSK 1-2). Speak mostly in English with simple
Chinese mixed in. Every time you write Chinese, give pinyin and an English gloss
in parentheses, e.g. 你好 (nǐ hǎo, hello).""",
    "medium": """Level: intermediate (around HSK 3-4). Speak mostly in Chinese
using fairly simple sentences. Only use English for a short clarification when the
student is clearly stuck. Give pinyin only for words that are new or likely
unfamiliar, not for every word. Do not translate whole sentences.""",
    "hard": """Level: advanced. Speak only in Chinese at a natural but not
overwhelming pace. Do not give pinyin or English translations unless the student
explicitly asks. Introduce new words in context and let the student infer meaning.""",
}
DEFAULT_LEVEL = "medium"

WEAK_TEMPLATE = """
The student has been struggling with these words. Naturally steer the conversation \
so they get chances to use them again (do not announce that you are doing this):
{items}
"""

ACTIVE_TEMPLATE = """
The student is currently learning these words from their flashcards. Weave them into \
the conversation naturally where they fit; don't force all of them, just reach for \
these instead of other vocabulary when you have the choice:
{items}
"""


def build_tutor_system(
    weak_items: list[str],
    active_words: list[str] | None = None,
    level: str = DEFAULT_LEVEL,
) -> str:
    """Build the tutor's system prompt: a difficulty level plus the student's own
    vocabulary (words they get wrong, and words they're currently drilling)."""
    system = TUTOR_BASE + "\n" + LEVELS.get(level, LEVELS[DEFAULT_LEVEL]) + "\n"
    if weak_items:
        system += WEAK_TEMPLATE.format(items="\n".join(f"- {w}" for w in weak_items))
    if active_words:
        system += ACTIVE_TEMPLATE.format(items="\n".join(f"- {w}" for w in active_words))
    return system


# ---- Pass B: the error analyzer ----

ANALYZER_SYSTEM = """You are a meticulous Mandarin analyzer for a beginner (HSK 1-2). \
You are given the tutor's last reply and the student's message. Do two things:

1. errors: identify concrete mistakes in the STUDENT's CHINESE only (ignore English). \
Give the corrected form in hanzi so it can be linked to their flashcards. Be strict \
but only flag genuine errors, not stylistic choices. Empty list if none.

2. study_words: pick out useful single vocabulary words worth adding as flashcards \
from THIS exchange: words the student got wrong, and notable NEW words the tutor \
introduced that a beginner should learn. Give each as a single word (not a phrase), \
with tone-marked pinyin, a short English gloss, and a simple HSK 1-2 example \
sentence in hanzi that uses the word (you may reuse how it was used in this \
conversation). Skip trivial function words (我, 你, 是, 的, 吗). Empty list if \
nothing new is worth learning."""

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "errors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "error_type": {
                        "type": "string",
                        "enum": [
                            "tone",
                            "wrong_word",
                            "word_order",
                            "missing_particle",
                            "measure_word",
                            "grammar",
                            "spelling",
                            "other",
                        ],
                    },
                    "span": {
                        "type": "string",
                        "description": "the exact text the student wrote that is wrong",
                    },
                    "correction": {
                        "type": "string",
                        "description": "the corrected phrase (hanzi + pinyin)",
                    },
                    "hanzi": {
                        "type": "string",
                        "description": "the single corrected word/pattern in hanzi, for flashcard linking (may be empty)",
                    },
                    "explanation": {
                        "type": "string",
                        "description": "one short sentence, learner-friendly",
                    },
                },
                "required": ["error_type", "span", "correction", "hanzi", "explanation"],
                "additionalProperties": False,
            },
        },
        "study_words": {
            "type": "array",
            "description": "new/notable vocabulary from this exchange, for auto-adding as flashcards",
            "items": {
                "type": "object",
                "properties": {
                    "hanzi": {"type": "string", "description": "the word in hanzi (a single word, not a phrase)"},
                    "pinyin": {"type": "string", "description": "tone-marked pinyin"},
                    "gloss": {"type": "string", "description": "short English meaning"},
                    "example": {"type": "string", "description": "a simple HSK 1-2 example sentence in hanzi using the word"},
                },
                "required": ["hanzi", "pinyin", "gloss", "example"],
                "additionalProperties": False,
            },
        },
        "encouragement": {
            "type": "string",
            "description": "one short encouraging line in English about their Chinese",
        },
    },
    "required": ["errors", "study_words", "encouragement"],
    "additionalProperties": False,
}


class Tutor:
    """Holds the two API passes for one chat session."""

    def __init__(self, weak_items: list[str] | None = None, active_words: list[str] | None = None,
                 level: str = DEFAULT_LEVEL, api_key: str | None = None):
        # api_key=None lets the SDK fall back to the ANTHROPIC_API_KEY env var.
        self.client = anthropic.Anthropic(api_key=api_key or None)
        self.system = build_tutor_system(weak_items or [], active_words or [], level)

    def reply(self, history: list[dict]) -> str:
        """The tutor's chat response."""
        resp = self.client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=self.system,
            messages=history,
        )
        return next((b.text for b in resp.content if b.type == "text"), "")

    def analyze(self, user_message: str, tutor_reply: str = "") -> dict:
        """Grade one message and extract new vocabulary. Returns a dict with
        errors, study_words and encouragement. Falls back to empty on bad JSON."""
        content = (
            f"Tutor said: {tutor_reply}\n\nStudent said: {user_message}"
            if tutor_reply
            else f"Student said: {user_message}"
        )
        resp = self.client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=ANALYZER_SYSTEM,
            messages=[{"role": "user", "content": content}],
            output_config={"format": {"type": "json_schema", "schema": ANALYSIS_SCHEMA}},
        )
        text = next((b.text for b in resp.content if b.type == "text"), "{}")
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return {"errors": [], "study_words": [], "encouragement": ""}
        data.setdefault("errors", [])
        data.setdefault("study_words", [])
        data.setdefault("encouragement", "")
        return data
