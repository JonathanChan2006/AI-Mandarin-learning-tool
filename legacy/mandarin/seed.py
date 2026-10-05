"""Load starter vocab into the item store."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from . import models

SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "seed_hsk1.json"


def seed(conn: sqlite3.Connection, path: Path = SEED_FILE) -> int:
    """Insert all starter words. Skips any that already exist. Returns count added."""
    words = json.loads(path.read_text(encoding="utf-8"))
    added = 0
    for w in words:
        rid = models.add_item(
            conn,
            hanzi=w["hanzi"],
            pinyin=w.get("pinyin", ""),
            gloss=w.get("gloss", ""),
            example=w.get("example", ""),
            tags="hsk1",
        )
        if rid is not None:
            added += 1
    return added
