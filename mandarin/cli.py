"""Command-line interface.

    python main.py seed
    python main.py import deck.apkg
    python main.py drill
    python main.py chat
    python main.py weak / mistakes / stats
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone

from . import db, models, seed as seed_mod
from .scheduler import RATING_LABELS, preview_intervals


def _fmt_due(due_iso: str) -> str:
    """Gap from now as a short string, e.g. '10m', '3d'."""
    due = datetime.fromisoformat(due_iso)
    delta = due - datetime.now(timezone.utc)
    secs = delta.total_seconds()
    if secs < 60:
        return "<1m"
    if secs < 3600:
        return f"{int(secs // 60)}m"
    if secs < 86400:
        return f"{int(secs // 3600)}h"
    return f"{int(secs // 86400)}d"


def cmd_seed(conn, args):
    added = seed_mod.seed(conn)
    total = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    print(f"Seeded {added} new item(s). Collection now has {total}.")


def cmd_add(conn, args):
    rid = models.add_item(
        conn,
        hanzi=args.hanzi,
        pinyin=args.pinyin or "",
        gloss=args.gloss or "",
        example=args.example or "",
        type_=args.type,
        tags=args.tags or "",
    )
    if rid is None:
        print(f"Already exists: {args.hanzi}")
    else:
        print(f"Added #{rid}: {args.hanzi}")


def cmd_drill(conn, args):
    items = models.due_items(conn, limit=args.limit)
    if not items:
        print("Nothing due. Come back later, or run 'add'/'import'.")
        return
    print(f"{len(items)} card(s) due. Grade: 1=Again 2=Hard 3=Good 4=Easy  (q=quit)\n")
    reviewed = 0
    for item in items:
        print(f"  {item['hanzi']}")
        try:
            input("  (press Enter to reveal) ")
        except EOFError:
            break
        print(f"  {item['pinyin']}   {item['gloss']}")
        if item["example"]:
            print(f"    e.g. {item['example']}")

        prev = preview_intervals(item["fsrs_card"])
        hint = "  ".join(f"{r}={RATING_LABELS[r]}(+{_fmt_due(prev[r])})" for r in (1, 2, 3, 4))
        print(f"    {hint}")

        try:
            raw = input("  grade> ").strip().lower()
        except EOFError:
            break
        if raw == "q":
            break
        if raw not in {"1", "2", "3", "4"}:
            print("    (skipped, not a valid grade)\n")
            continue
        new_due = models.grade_item(conn, item, int(raw))
        flag = "  (logged as mistake)" if raw == "1" else ""
        print(f"    next review in {_fmt_due(new_due)}{flag}\n")
        reviewed += 1
    print(f"Done. Reviewed {reviewed} card(s).")


def cmd_weak(conn, args):
    rows = models.weak_items(conn, limit=args.limit)
    if not rows:
        print("No mistakes logged yet. Go drill or chat.")
        return
    print("Weak spots (recency-weighted, fades over time, redeemed by getting it right):\n")
    for r in rows:
        print(f"  {r['score']:>4.1f}  {r['hanzi']:<6} {r['pinyin']:<10} {r['gloss']}")


def cmd_mistakes(conn, args):
    rows = conn.execute(
        "SELECT * FROM mistakes ORDER BY ts DESC LIMIT ?", (args.limit,)
    ).fetchall()
    if not rows:
        print("Mistake log is empty.")
        return
    for r in rows:
        ts = r["ts"][:19].replace("T", " ")
        print(f"  {ts}  [{r['source']}/{r['error_type']}]  {r['expected'] or r['note']}")


def _descriptors(rows):
    # Short strings for the tutor prompt, e.g. '还是 (háishi, or)'.
    return [f"{r['hanzi']} ({r['pinyin']}, {r['gloss']})" for r in rows]


def cmd_chat(conn, args):
    # Imported here so the other commands don't need the anthropic SDK or a key.
    import os

    import anthropic

    from . import tutor as tutor_mod

    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        print(tutor_mod.AUTH_HINT)
        return

    weak = _descriptors(models.weak_items(conn, limit=8))
    active = _descriptors(models.active_words(conn, limit=12))
    tutor = tutor_mod.Tutor(weak_items=weak, active_words=active, level=args.level)

    print(f"Chatting with 老师 (Lǎoshī) at '{args.level}' level. Type your message; 'quit' to stop.")
    bits = []
    if weak:
        bits.append(f"{len(weak)} weak words")
    if active:
        bits.append(f"{len(active)} words you're drilling")
    if bits:
        print(f"(Tutor is weaving in {' and '.join(bits)}.)")
    print()

    # A hidden opening turn so the tutor greets first. Not graded.
    history = [{"role": "user", "content": "(The student just joined. Greet them warmly in your style and start a simple conversation.)"}]
    try:
        opening = tutor.reply(history)
    except anthropic.AuthenticationError:
        print(tutor_mod.AUTH_HINT)
        return
    except anthropic.APIError as e:
        print(f"API error: {e}")
        return
    history.append({"role": "assistant", "content": opening})
    print(f"老师: {opening}\n")

    while True:
        try:
            text = input("you> ").strip()
        except EOFError:
            break
        if not text or text.lower() in {"quit", "exit"}:
            break

        history.append({"role": "user", "content": text})
        try:
            reply = tutor.reply(history)
            analysis = tutor.analyze(text, tutor_reply=reply)
        except anthropic.APIError as e:
            print(f"  (API error: {e})")
            history.pop()
            continue
        history.append({"role": "assistant", "content": reply})
        print(f"\n老师: {reply}")

        errors = analysis.get("errors", [])
        if errors:
            print("\n  notes:")
            for e in errors:
                linked = models.register_conversation_error(
                    conn,
                    error_type=e.get("error_type", "other"),
                    span=e.get("span", ""),
                    correction=e.get("correction", ""),
                    hanzi=e.get("hanzi", ""),
                    explanation=e.get("explanation", ""),
                )
                tag = " (re-added to your reviews)" if linked else ""
                print(f"    {e.get('span','')} -> {e.get('correction','')}  ({e.get('explanation','')}){tag}")

        added = models.add_study_words(conn, analysis.get("study_words", []))
        if added:
            print(f"\n  added to your deck: {' '.join(added)}")

        if analysis.get("encouragement"):
            print(f"  {analysis['encouragement']}")
        print()

    print("再见 (zàijiàn, goodbye). Your mistakes were logged; run 'weak' to see them.")


def _resolve_field(spec, field_names):
    """Turn a field spec (a 1-based number or a field name) into a 0-based index,
    or None if it's empty/'skip'."""
    if not spec or str(spec).lower() == "skip":
        return None
    spec = str(spec).strip()
    if spec.isdigit():
        idx = int(spec) - 1
        if 0 <= idx < len(field_names):
            return idx
        raise ValueError(f"field number {spec} out of range (1-{len(field_names)})")
    for i, name in enumerate(field_names):
        if name.lower() == spec.lower():
            return i
    raise ValueError(f"no field named {spec!r}")


def cmd_import(conn, args):
    from . import importer

    try:
        field_names, notes, skipped = importer.read_apkg(args.file)
    except importer.ApkgError as e:
        print(f"Could not read deck: {e}")
        return

    print(f"Read {len(notes)} notes. Fields in this deck:")
    for i, name in enumerate(field_names, 1):
        print(f"  {i}. {name}")
    if skipped:
        print(f"(Ignoring {skipped} notes from other note types.)")

    print("\nSample notes:")
    for parts in notes[:3]:
        cleaned = [importer.clean_field(p) for p in parts]
        print("  | " + " | ".join(cleaned))
    print()

    # Get the column mapping from flags, or ask for it.
    def ask(label, required):
        while True:
            raw = input(f"  which field # is {label}?{'' if required else ' (Enter to skip)'} ").strip()
            if not raw and not required:
                return None
            try:
                idx = _resolve_field(raw, field_names)
                if idx is None and required:
                    print("    (required)")
                    continue
                return idx
            except ValueError as err:
                print(f"    {err}")

    try:
        hanzi_idx = _resolve_field(args.hanzi, field_names) if args.hanzi else ask("hanzi (the Chinese word)", True)
        pinyin_idx = _resolve_field(args.pinyin, field_names) if args.pinyin else ask("pinyin", False)
        gloss_idx = _resolve_field(args.gloss, field_names) if args.gloss else ask("English meaning", False)
        example_idx = _resolve_field(args.example, field_names) if args.example else ask("example sentence (hanzi)", False)
    except ValueError as e:
        print(f"Bad field mapping: {e}")
        return

    parts_map = [("hanzi", hanzi_idx), ("pinyin", pinyin_idx), ("gloss", gloss_idx), ("example", example_idx)]
    mapping = ", ".join(f"{label}={field_names[i]}" for label, i in parts_map if i is not None)
    print(f"\nMapping: {mapping}")

    if args.dry_run:
        print("Dry run, showing the first 5 as they'd be imported:")
        for parts in notes[:5]:
            g = lambda i: importer.clean_field(parts[i]) if i is not None and i < len(parts) else ""
            line = f"  {g(hanzi_idx):<8} {g(pinyin_idx):<12} {g(gloss_idx)}"
            if example_idx is not None:
                line += f"   | {g(example_idx)}"
            print(line)
        print("\n(No changes made. Re-run without --dry-run to import.)")
        return

    added, dupes, empty = importer.import_notes(
        conn, notes, hanzi_idx, pinyin_idx, gloss_idx, example_idx,
        field_names=field_names, tags=args.tags
    )
    total = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    print(f"\nImported {added} new word(s). Skipped {dupes} duplicate(s), {empty} empty.")
    print(f"Collection now has {total} items. Run 'drill' to start reviewing.")


def cmd_stats(conn, args):
    total = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    due = len(models.due_items(conn, limit=10_000))
    reviews = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
    mistakes = conn.execute("SELECT COUNT(*) FROM mistakes").fetchone()[0]
    print(f"Items:    {total}")
    print(f"Due now:  {due}")
    print(f"Reviews:  {reviews}")
    print(f"Mistakes: {mistakes}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="mandarin", description="Mandarin flashcards + tutor")
    p.add_argument("--db", default=str(db.DEFAULT_DB), help="path to SQLite file")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("seed", help="load HSK1 starter vocab").set_defaults(func=cmd_seed)

    a = sub.add_parser("add", help="add one item")
    a.add_argument("hanzi")
    a.add_argument("--pinyin")
    a.add_argument("--gloss")
    a.add_argument("--example")
    a.add_argument("--type", default="vocab")
    a.add_argument("--tags")
    a.set_defaults(func=cmd_add)

    d = sub.add_parser("drill", help="review due cards")
    d.add_argument("--limit", type=int, default=20)
    d.set_defaults(func=cmd_drill)

    w = sub.add_parser("weak", help="show most-missed items")
    w.add_argument("--limit", type=int, default=10)
    w.set_defaults(func=cmd_weak)

    m = sub.add_parser("mistakes", help="show recent mistake log")
    m.add_argument("--limit", type=int, default=20)
    m.set_defaults(func=cmd_mistakes)

    imp = sub.add_parser("import", help="import an Anki .apkg deck")
    imp.add_argument("file", help="path to the .apkg file")
    imp.add_argument("--hanzi", help="field name or 1-based number holding the Chinese word")
    imp.add_argument("--pinyin", help="field for pinyin (optional)")
    imp.add_argument("--gloss", help="field for the English meaning (optional)")
    imp.add_argument("--example", help="field for an example sentence (optional)")
    imp.add_argument("--tags", default="anki", help="tag to attach to imported items")
    imp.add_argument("--dry-run", action="store_true", help="preview without importing")
    imp.set_defaults(func=cmd_import)

    c = sub.add_parser("chat", help="converse with the LLM tutor (needs ANTHROPIC_API_KEY)")
    c.add_argument("--level", choices=["easy", "medium", "hard"], default="medium",
                   help="tutor difficulty (default: medium)")
    c.set_defaults(func=cmd_chat)

    sub.add_parser("stats", help="collection summary").set_defaults(func=cmd_stats)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    conn = db.connect(args.db)
    try:
        args.func(conn, args)
    finally:
        conn.close()
