"""Wrapper around the fsrs library so the rest of the app deals in JSON strings.

fsrs 3.1.0 API:
    f = FSRS()
    sched = f.repeat(card, now)      # {Rating: SchedulingInfo}
    new_card = sched[Rating.Good].card
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fsrs import FSRS, Card, Rating

_engine = FSRS()

RATINGS = {
    1: Rating.Again,
    2: Rating.Hard,
    3: Rating.Good,
    4: Rating.Easy,
}
RATING_LABELS = {1: "Again", 2: "Hard", 3: "Good", 4: "Easy"}


def new_card() -> tuple[str, str]:
    """(fsrs_card_json, due_iso) for a brand-new item."""
    card = Card()
    return json.dumps(card.to_dict()), card.due.isoformat()


def review(fsrs_card_json: str, rating: int, now: datetime | None = None) -> tuple[str, str]:
    """Apply a grade to a stored card. Returns (new_card_json, new_due_iso)."""
    now = now or datetime.now(timezone.utc)
    card = Card.from_dict(json.loads(fsrs_card_json))
    scheduled = _engine.repeat(card, now)[RATINGS[rating]].card
    return json.dumps(scheduled.to_dict()), scheduled.due.isoformat()


def preview_intervals(fsrs_card_json: str, now: datetime | None = None) -> dict[int, str]:
    """Resulting due date for each grade, used to show the interval hints."""
    now = now or datetime.now(timezone.utc)
    card = Card.from_dict(json.loads(fsrs_card_json))
    sched = _engine.repeat(card, now)
    return {r: sched[RATINGS[r]].card.due.isoformat() for r in RATINGS}
