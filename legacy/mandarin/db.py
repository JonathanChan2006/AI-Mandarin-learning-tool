"""SQLite storage.

items    - words being learned; each row holds its FSRS card as JSON.
mistakes - append-only log of errors (never updated/deleted). The weak-word
           score is computed from this, not stored.
reviews  - every grade given, used for the fading-memory score and debugging.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "mandarin.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'vocab',   -- vocab | grammar | tone | measure_word
    hanzi      TEXT NOT NULL,
    pinyin     TEXT NOT NULL DEFAULT '',
    gloss      TEXT NOT NULL DEFAULT '',
    example    TEXT NOT NULL DEFAULT '',
    tags       TEXT NOT NULL DEFAULT '',        -- comma-separated, e.g. "hsk1"
    extra      TEXT NOT NULL DEFAULT '{}',       -- JSON: other imported fields (audio, POS, etc.)
    fsrs_card  TEXT NOT NULL,                    -- JSON from fsrs.Card.to_dict()
    due        TEXT NOT NULL,                    -- ISO due date, duplicated here for querying
    created_at TEXT NOT NULL,
    UNIQUE(hanzi, type)
);

CREATE TABLE IF NOT EXISTS mistakes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     INTEGER,                         -- nullable: a chat slip may not match a known word
    ts          TEXT NOT NULL,
    source      TEXT NOT NULL,                   -- flashcard | conversation
    error_type  TEXT NOT NULL DEFAULT 'recall',  -- recall | tone | wrong_word | word_order | ...
    user_said   TEXT NOT NULL DEFAULT '',
    expected    TEXT NOT NULL DEFAULT '',
    context     TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS reviews (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id  INTEGER NOT NULL,
    ts       TEXT NOT NULL,
    rating   INTEGER NOT NULL,                   -- 1 Again | 2 Hard | 3 Good | 4 Easy
    FOREIGN KEY(item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_items_due ON items(due);
CREATE INDEX IF NOT EXISTS idx_mistakes_item ON mistakes(item_id);
"""


def connect(db_path: Path | str = DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    # CREATE TABLE IF NOT EXISTS won't alter an existing table, so add new columns here.
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(items)")}
    if "extra" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN extra TEXT NOT NULL DEFAULT '{}'")
        conn.commit()
