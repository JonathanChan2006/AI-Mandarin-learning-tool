"""Import an Anki .apkg deck.

An .apkg is a zip holding an SQLite database (collection.anki2 / collection.anki21).
A note's fields are stored as one string joined by 0x1f; the field names live in
the note type. We read both so the fields can be mapped by name. Read-only.
"""

from __future__ import annotations

import json
import re
import sqlite3
import tempfile
import zipfile
from pathlib import Path

from . import models

FIELD_SEP = "\x1f"  # Anki joins a note's fields with this char

_SOUND_RE = re.compile(r"\[(?:sound|anki|type)[^\]]*\]", re.IGNORECASE)
# Line-break/block tags become a space; other (inline) tags are dropped with no
# space, so a bolded word like <b>的</b> doesn't leave gaps in Chinese text.
_BREAK_RE = re.compile(r"<\s*/?(?:br|div|p|li|tr|h[1-6])\b[^>]*>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def clean_field(raw: str) -> str:
    """Strip Anki/HTML markup down to plain text.

    我是他<b>的</b>朋友 becomes 我是他的朋友, not 我是他 的 朋友.
    """
    s = _SOUND_RE.sub(" ", raw)
    s = _BREAK_RE.sub(" ", s)
    s = _TAG_RE.sub("", s)
    s = (
        s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
    )
    return _WS_RE.sub(" ", s).strip()


class ApkgError(Exception):
    pass


def _locate_collection(zf: zipfile.ZipFile) -> str:
    # Prefer a plain SQLite member. The newer collection.anki21b is zstd-compressed
    # and we can't read it, so give a clear message if that's all there is.
    names = set(zf.namelist())
    for plain in ("collection.anki21", "collection.anki2"):
        if plain in names:
            return plain
    if "collection.anki21b" in names:
        raise ApkgError(
            "This .apkg uses Anki's newer compressed format (collection.anki21b). "
            "Re-export from Anki with 'Support older Anki versions' CHECKED in the "
            "export dialog to get a readable collection.anki2."
        )
    raise ApkgError("No Anki collection database found inside the .apkg.")


def _field_names_by_model(con: sqlite3.Connection) -> dict[int, list[str]]:
    """Map each note-type id to its ordered field names, from either storage layout."""
    names: dict[int, list[str]] = {}

    # Older layout: col.models is JSON of {mid: {"flds": [{"name","ord"}, ...]}}.
    row = con.execute("SELECT models FROM col LIMIT 1").fetchone()
    if row and row[0]:
        try:
            for mid, model in json.loads(row[0]).items():
                flds = sorted(model.get("flds", []), key=lambda f: f.get("ord", 0))
                names[int(mid)] = [f["name"] for f in flds]
        except (json.JSONDecodeError, KeyError, ValueError):
            pass

    # Newer layout (schema v18+): separate notetypes/fields tables.
    if not names:
        try:
            rows = con.execute(
                "SELECT ntid, ord, name FROM fields ORDER BY ntid, ord"
            ).fetchall()
            for ntid, _ord, name in rows:
                names.setdefault(int(ntid), []).append(name)
        except sqlite3.OperationalError:
            pass

    return names


def read_apkg(path: str | Path) -> tuple[list[str], list[list[str]], int]:
    """Read the deck's most common note type.

    Returns (field_names, notes, skipped). notes is a list of field-value lists;
    skipped counts notes from other note types.
    """
    path = Path(path)
    if not path.exists():
        raise ApkgError(f"File not found: {path}")

    with zipfile.ZipFile(path) as zf:
        member = _locate_collection(zf)
        data = zf.read(member)

    with tempfile.NamedTemporaryFile(suffix=".anki2", delete=True) as tmp:
        tmp.write(data)
        tmp.flush()
        con = sqlite3.connect(tmp.name)
        try:
            field_names = _field_names_by_model(con)
            rows = con.execute("SELECT mid, flds FROM notes").fetchall()
        finally:
            con.close()

    if not rows:
        raise ApkgError("The deck contains no notes.")

    counts: dict[int, int] = {}
    for mid, _flds in rows:
        counts[mid] = counts.get(mid, 0) + 1
    primary_mid = max(counts, key=counts.get)
    names = field_names.get(primary_mid) or []

    notes: list[list[str]] = []
    skipped = 0
    for mid, flds in rows:
        if mid != primary_mid:
            skipped += 1
            continue
        parts = flds.split(FIELD_SEP)
        if not names:
            names = [f"field{i + 1}" for i in range(len(parts))]
        notes.append(parts)

    return names, notes, skipped


def import_notes(
    conn: sqlite3.Connection,
    notes: list[list[str]],
    hanzi_idx: int,
    pinyin_idx: int | None,
    gloss_idx: int | None,
    example_idx: int | None = None,
    field_names: list[str] | None = None,
    tags: str = "anki",
) -> tuple[int, int, int]:
    """Insert notes as items using the chosen 0-based column indices.

    Fields not mapped to a column are kept (raw, so audio refs survive) in the
    item's extra JSON. Returns (added, dupes, empty).
    """
    mapped = {i for i in (hanzi_idx, pinyin_idx, gloss_idx, example_idx) if i is not None}
    added = dupes = empty = 0
    for parts in notes:
        def get(i):
            return clean_field(parts[i]) if i is not None and i < len(parts) else ""

        hanzi = get(hanzi_idx)
        if not hanzi:
            empty += 1
            continue

        extra = {}
        for i, raw in enumerate(parts):
            if i in mapped or not raw.strip():
                continue
            key = field_names[i] if field_names and i < len(field_names) else f"field{i + 1}"
            extra[key] = raw

        rid = models.add_item(
            conn,
            hanzi=hanzi,
            pinyin=get(pinyin_idx),
            gloss=get(gloss_idx),
            example=get(example_idx),
            tags=tags,
            extra=extra,
        )
        if rid is None:
            dupes += 1
        else:
            added += 1
    return added, dupes, empty
