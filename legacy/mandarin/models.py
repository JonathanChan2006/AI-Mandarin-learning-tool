"""Read/write helpers for items and mistakes. Plain functions over sqlite3."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from . import scheduler

# Weak-word score fades with age: a mistake's weight halves every HALF_LIFE_DAYS,
# and a later correct recall subtracts from it. See weak_items().
HALF_LIFE_DAYS = 30.0
SUCCESS_WEIGHT = 1.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def add_item(
    conn: sqlite3.Connection,
    hanzi: str,
    pinyin: str = "",
    gloss: str = "",
    example: str = "",
    type_: str = "vocab",
    tags: str = "",
    extra: dict | None = None,
) -> int | None:
    """Add a word with a fresh FSRS card. Returns the row id, or None if it's a dup.

    extra holds any leftover imported fields (audio, POS, ...) as JSON.
    """
    card_json, due = scheduler.new_card()
    try:
        cur = conn.execute(
            """INSERT INTO items (type, hanzi, pinyin, gloss, example, tags, extra, fsrs_card, due, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (type_, hanzi, pinyin, gloss, example, tags,
             json.dumps(extra or {}, ensure_ascii=False), card_json, due, _now_iso()),
        )
        conn.commit()
        return cur.lastrowid
    except sqlite3.IntegrityError:
        return None


def due_items(conn: sqlite3.Connection, limit: int = 20) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM items WHERE due <= ? ORDER BY due ASC LIMIT ?",
        (_now_iso(), limit),
    ).fetchall()


def apply_fsrs(conn: sqlite3.Connection, item: sqlite3.Row, rating: int) -> str:
    """Update the card and log the review. No mistake logging (callers decide that)."""
    new_card_json, new_due = scheduler.review(item["fsrs_card"], rating)
    conn.execute(
        "UPDATE items SET fsrs_card = ?, due = ? WHERE id = ?",
        (new_card_json, new_due, item["id"]),
    )
    conn.execute(
        "INSERT INTO reviews (item_id, ts, rating) VALUES (?, ?, ?)",
        (item["id"], _now_iso(), rating),
    )
    conn.commit()
    return new_due


def grade_item(conn: sqlite3.Connection, item: sqlite3.Row, rating: int) -> str:
    """Grade a flashcard. A rating of 1 (Again) also logs a mistake."""
    new_due = apply_fsrs(conn, item, rating)
    if rating == 1:
        log_mistake(
            conn,
            item_id=item["id"],
            source="flashcard",
            error_type="recall",
            expected=f'{item["hanzi"]} ({item["pinyin"]}) = {item["gloss"]}',
            note="failed flashcard recall",
        )
    return new_due


def find_item_by_hanzi(conn: sqlite3.Connection, hanzi: str) -> sqlite3.Row | None:
    if not hanzi:
        return None
    return conn.execute(
        "SELECT * FROM items WHERE hanzi = ? ORDER BY id LIMIT 1", (hanzi,)
    ).fetchone()


def register_conversation_error(
    conn: sqlite3.Connection,
    error_type: str,
    span: str,
    correction: str,
    hanzi: str,
    explanation: str,
) -> bool:
    """Log a mistake from a chat turn. If it matches a known word, grade that card
    Again so it comes back sooner. Returns True if it matched a word."""
    item = find_item_by_hanzi(conn, hanzi)
    item_id = item["id"] if item else None
    log_mistake(
        conn,
        item_id=item_id,
        source="conversation",
        error_type=error_type,
        user_said=span,
        expected=correction,
        context=hanzi,
        note=explanation,
    )
    if item is not None:
        apply_fsrs(conn, item, 1)
    return item is not None


def log_mistake(
    conn: sqlite3.Connection,
    item_id: int | None,
    source: str,
    error_type: str = "recall",
    user_said: str = "",
    expected: str = "",
    context: str = "",
    note: str = "",
) -> int:
    cur = conn.execute(
        """INSERT INTO mistakes (item_id, ts, source, error_type, user_said, expected, context, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (item_id, _now_iso(), source, error_type, user_said, expected, context, note),
    )
    conn.commit()
    return cur.lastrowid


def add_study_words(conn: sqlite3.Connection, words: list[dict], tags: str = "chat") -> list[str]:
    """Add words picked up during a chat as new cards. Dups are skipped.
    Returns the hanzi actually added."""
    added = []
    for w in words:
        hanzi = (w.get("hanzi") or "").strip()
        if not hanzi:
            continue
        rid = add_item(
            conn,
            hanzi=hanzi,
            pinyin=(w.get("pinyin") or "").strip(),
            gloss=(w.get("gloss") or "").strip(),
            example=(w.get("example") or "").strip(),
            tags=tags,
        )
        if rid is not None:
            added.append(hanzi)
    return added


def _decay(ts_iso: str, now: datetime) -> float:
    # 1.0 now, 0.5 after one half-life, approaching 0 as it ages.
    age_days = (now - datetime.fromisoformat(ts_iso)).total_seconds() / 86400.0
    return 0.5 ** (age_days / HALF_LIFE_DAYS)


def weak_items(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    """Words ranked by a fading struggle score.

    score = sum of decayed mistakes minus sum of decayed correct recalls. Old
    mistakes fade out; getting a word right later pushes its score down so it
    drops off the list. Returns item dicts with an added 'score' key.
    """
    now = datetime.now(timezone.utc)
    scores: dict[int, float] = {}

    for r in conn.execute("SELECT item_id, ts FROM mistakes WHERE item_id IS NOT NULL"):
        scores[r["item_id"]] = scores.get(r["item_id"], 0.0) + _decay(r["ts"], now)
    for r in conn.execute("SELECT item_id, ts FROM reviews WHERE rating >= 3"):
        scores[r["item_id"]] = scores.get(r["item_id"], 0.0) - SUCCESS_WEIGHT * _decay(r["ts"], now)

    ranked = sorted(
        ((iid, s) for iid, s in scores.items() if s > 0.05),
        key=lambda x: -x[1],
    )[:limit]
    if not ranked:
        return []

    rows = {
        r["id"]: r
        for r in conn.execute(
            f"SELECT * FROM items WHERE id IN ({','.join('?' * len(ranked))})",
            [iid for iid, _ in ranked],
        )
    }
    out = []
    for iid, score in ranked:
        row = rows.get(iid)
        if row is None:
            continue
        d = dict(row)
        d["score"] = round(score, 2)
        out.append(d)
    return out


def active_words(conn: sqlite3.Connection, limit: int = 12) -> list[dict]:
    """Most recently reviewed words, for the tutor to reuse in conversation.
    Empty if nothing has been drilled yet."""
    rows = conn.execute(
        """SELECT i.hanzi, i.pinyin, i.gloss, MAX(r.ts) AS last_seen
           FROM items i JOIN reviews r ON r.item_id = i.id
           GROUP BY i.id
           ORDER BY last_seen DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]
