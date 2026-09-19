"""
analysis.py — Reads a call transcript and works out what happened.

WHY THIS EXISTS RATHER THAN READING endedReason

Vapi reports why a call ended, not what was decided. A lead who says
"not interested, remove my number" and hangs up produces exactly the same
endedReason as one who says "yes, send me the details" and hangs up —
customer-ended-call in both cases.

So the outcome can only come from the conversation itself.
"""

import os
import json
import logging
from dataclasses import dataclass

from openai import OpenAI, OpenAIError

log = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Small and cheap — this is a short classification task, not a reasoning one.
# Override in .env if a different model is preferred.
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


class AnalysisUnavailable(Exception):
    """Analysis could not run. The transcript is kept for a human to read."""


@dataclass
class CallAnalysis:
    outcome: str        # "agreed" | "declined" | "unclear"
    score: float        # 0–100, likelihood this lead converts
    sentiment: float    # 0–100, how positive the conversation was
    summary: str        # two or three sentences for the dashboard


SYSTEM_PROMPT = """\
You analyse sales call transcripts for an investment outreach platform.
The AI caller has just spoken with a potential investor.

Return JSON with exactly these four fields:

  outcome    "agreed" if the lead expressed genuine interest, asked for more
             information, requested a callback, or committed to anything.
             "declined" if they refused, asked to be removed, said they were
             not interested, or were already served by someone else.
             "unclear" if the call was too short or ambiguous to judge — do
             not guess. A wrong "agreed" wastes an advisor's time; a wrong
             "declined" loses a real prospect.

  score      0-100. How likely this lead is to actually invest, based only
             on what they said. A vague "send me something" is not an 80.
             Reserve above 85 for an explicit commitment.

  sentiment  0-100. How positive the lead's tone was. This is distinct from
             score — someone can be perfectly pleasant while declining.

  summary    Two or three sentences. What the lead said, what they want
             next, and any concrete detail worth acting on (an amount, a
             timeframe, a preferred contact method). Written for a sales
             person about to pick this lead up. No preamble.

Judge only what is in the transcript. Do not infer beyond it.\
"""


def is_configured() -> bool:
    return bool(OPENAI_API_KEY)


def analyse_transcript(transcript: str, lead_name: str = "") -> CallAnalysis:
    """
    Classify one call.

    Raises AnalysisUnavailable if OpenAI is unreachable or unconfigured —
    the caller leaves the lead for a human rather than guessing.
    """
    if not is_configured():
        raise AnalysisUnavailable("OPENAI_API_KEY is not set")

    if not transcript or len(transcript.strip()) < 20:
        # Too short to mean anything. Two lines of "hello" tells us nothing,
        # and asking the model to judge it invites a confident wrong answer.
        raise AnalysisUnavailable("Transcript too short to analyse")

    client = OpenAI(api_key=OPENAI_API_KEY)

    user_prompt = (
        f"Lead name: {lead_name or 'unknown'}\n\n"
        f"Transcript:\n{transcript}"
    )

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,   # classification, not creative writing
            max_tokens=400,
        )
    except OpenAIError as exc:
        raise AnalysisUnavailable(f"OpenAI request failed: {exc}") from exc

    raw = response.choices[0].message.content or ""

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AnalysisUnavailable(f"Model returned unparseable JSON: {raw[:200]}") from exc

    outcome = str(data.get("outcome", "unclear")).lower().strip()
    if outcome not in ("agreed", "declined", "unclear"):
        log.warning("Unexpected outcome %r, treating as unclear", outcome)
        outcome = "unclear"

    def _bounded(value, fallback: float) -> float:
        """Clamp to 0–100. Models occasionally return 0–1 or overshoot."""
        try:
            number = float(value)
        except (TypeError, ValueError):
            return fallback
        if 0 < number <= 1:
            number *= 100      # model answered on a 0–1 scale
        return max(0.0, min(100.0, number))

    summary = str(data.get("summary", "")).strip()
    if not summary:
        summary = "No summary was generated for this call."

    return CallAnalysis(
        outcome=outcome,
        score=_bounded(data.get("score"), 50.0),
        sentiment=_bounded(data.get("sentiment"), 50.0),
        summary=summary,
    )
