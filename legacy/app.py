#!/usr/bin/env python3
"""Desktop UI for the Mandarin tutor, built with Flet.

Runs on Mac, Windows and Linux. It reuses the same engine as the CLI
(mandarin/*.py); this file only builds the screens. Run with:

    ./.venv/bin/flet run app.py       # opens a window
    ./.venv/bin/flet build macos      # package into a .app (Windows: build on Windows)
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone

import flet as ft

from mandarin import db, models, settings as settings_mod
from mandarin.scheduler import preview_intervals, RATING_LABELS

GREEN = ft.Colors.GREEN_400


def fmt_interval(due_iso: str) -> str:
    delta = datetime.fromisoformat(due_iso) - datetime.now(timezone.utc)
    secs = delta.total_seconds()
    if secs < 60:
        return "<1m"
    if secs < 3600:
        return f"{int(secs // 60)}m"
    if secs < 86400:
        return f"{int(secs // 3600)}h"
    return f"{int(secs // 86400)}d"


def main(page: ft.Page):
    page.title = "Mandarin Tutor"
    page.theme_mode = ft.ThemeMode.DARK
    try:
        page.window.width = 940
        page.window.height = 720
        page.window.min_width = 720
        page.window.min_height = 560
    except Exception:
        pass

    conn = db.connect()
    body = ft.Container(expand=True, padding=24)

    def set_body(control):
        body.content = control
        page.update()

    # ---------- Home ----------
    def stat_tile(label, value):
        return ft.Container(
            ft.Column([ft.Text(str(value), size=30, weight=ft.FontWeight.BOLD),
                       ft.Text(label, size=13, color=ft.Colors.GREY_400)], spacing=2),
            padding=18, border_radius=10, bgcolor=ft.Colors.WHITE10, width=150,
        )

    def view_home():
        total = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        due = len(models.due_items(conn, limit=100000))
        reviews = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
        mistakes = conn.execute("SELECT COUNT(*) FROM mistakes").fetchone()[0]
        set_body(ft.Column([
            ft.Text("你好", size=34, weight=ft.FontWeight.BOLD),
            ft.Text("Mandarin flashcards and an AI tutor that targets your mistakes.",
                    color=ft.Colors.GREY_400),
            ft.Divider(height=24),
            ft.Row([stat_tile("words", total), stat_tile("due now", due),
                    stat_tile("reviews", reviews), stat_tile("mistakes", mistakes)],
                   wrap=True, spacing=14),
            ft.Container(height=14),
            ft.FilledButton(f"Review {due} due card(s)", icon=ft.Icons.SCHOOL,
                            on_click=lambda e: select(1), disabled=due == 0),
        ], spacing=8))

    # ---------- Review ----------
    drill = {"queue": [], "i": 0, "revealed": False}

    def view_review():
        drill["queue"] = models.due_items(conn, limit=100000)
        drill["i"] = 0
        drill["revealed"] = False
        render_card()

    def render_card():
        q, i = drill["queue"], drill["i"]
        if i >= len(q):
            set_body(ft.Column([
                ft.Text("Done for now.", size=26, weight=ft.FontWeight.BOLD),
                ft.Text(f"Reviewed {i} card(s).", color=ft.Colors.GREY_400),
                ft.FilledButton("Back to home", on_click=lambda e: select(0)),
            ], spacing=12, horizontal_alignment=ft.CrossAxisAlignment.CENTER,
               alignment=ft.MainAxisAlignment.CENTER, expand=True))
            return
        item = q[i]
        parts = [
            ft.Text(f"{i + 1} / {len(q)}", size=12, color=ft.Colors.GREY_500),
            ft.Container(height=10),
            ft.Text(item["hanzi"], size=72, weight=ft.FontWeight.BOLD,
                    text_align=ft.TextAlign.CENTER),
        ]
        if not drill["revealed"]:
            parts += [ft.Container(height=20),
                      ft.FilledButton("Reveal", on_click=lambda e: reveal())]
        else:
            prev = preview_intervals(item["fsrs_card"])
            parts += [
                ft.Text(item["pinyin"], size=26, color=GREEN),
                ft.Text(item["gloss"], size=18),
                ft.Text(item["example"] or "", size=15, color=ft.Colors.GREY_400,
                        italic=True),
                ft.Container(height=18),
                ft.Row([grade_btn(r, fmt_interval(prev[r])) for r in (1, 2, 3, 4)],
                       alignment=ft.MainAxisAlignment.CENTER, spacing=10, wrap=True),
            ]
        set_body(ft.Column(parts, spacing=8,
                           horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                           alignment=ft.MainAxisAlignment.CENTER, expand=True,
                           scroll=ft.ScrollMode.AUTO))

    def grade_btn(rating, interval):
        return ft.OutlinedButton(f"{RATING_LABELS[rating]}\n+{interval}",
                                 on_click=lambda e, r=rating: grade(r))

    def reveal():
        drill["revealed"] = True
        render_card()

    def grade(rating):
        models.grade_item(conn, drill["queue"][drill["i"]], rating)
        drill["i"] += 1
        drill["revealed"] = False
        render_card()

    # ---------- Chat ----------
    chat = {"tutor": None, "history": [], "level": "medium"}

    def view_chat():
        key = settings_mod.get_api_key()
        if not key:
            set_body(ft.Column([
                ft.Text("Chat needs an API key", size=22, weight=ft.FontWeight.BOLD),
                ft.Text("Add your Anthropic API key in Settings to talk to the tutor."),
                ft.FilledButton("Open Settings", on_click=lambda e: select(5)),
            ], spacing=12))
            return

        messages = ft.ListView(expand=True, spacing=10, auto_scroll=True, padding=6)
        notes = ft.ListView(expand=True, spacing=8, auto_scroll=True, padding=6)
        spinner = ft.ProgressRing(visible=False, width=18, height=18)
        field = ft.TextField(hint_text="Type in Chinese or English...", expand=True,
                             on_submit=lambda e: send())

        def rebuild_tutor():
            from mandarin import tutor as tutor_mod
            weak = [f"{r['hanzi']} ({r['pinyin']}, {r['gloss']})"
                    for r in models.weak_items(conn, limit=8)]
            active = [f"{r['hanzi']} ({r['pinyin']}, {r['gloss']})"
                      for r in models.active_words(conn, limit=12)]
            chat["tutor"] = tutor_mod.Tutor(weak_items=weak, active_words=active,
                                            level=chat["level"], api_key=key)
            chat["history"] = []

        def bubble(role, text):
            # Bubble takes ~70% of the conversation column (via flex), so it always
            # fits and never overlaps the sidebar, whatever the window width.
            box = ft.Container(
                ft.Text(text, selectable=True),
                padding=12, border_radius=12, expand=7,
                bgcolor=ft.Colors.BLUE_GREY_700 if role == "you" else ft.Colors.WHITE10,
            )
            spacer = ft.Container(expand=3)
            row = ft.Row([spacer, box] if role == "you" else [box, spacer])
            messages.controls.append(row)

        def note(text, color):
            notes.controls.append(ft.Text(text, size=13, color=color, selectable=True))

        def on_level(e):
            chat["level"] = e.control.value
            rebuild_tutor()
            messages.controls.clear()
            notes.controls.clear()
            note(f"Level set to {chat['level']}.", ft.Colors.GREY_400)
            page.update()

        def send():
            text = (field.value or "").strip()
            if not text:
                return
            field.value = ""
            bubble("you", text)
            spinner.visible = True
            field.disabled = True
            page.update()

            def work():
                # sqlite connections can't be shared across threads, so open one here.
                wconn = db.connect()
                try:
                    chat["history"].append({"role": "user", "content": text})
                    reply = chat["tutor"].reply(chat["history"])
                    analysis = chat["tutor"].analyze(text, tutor_reply=reply)
                    chat["history"].append({"role": "assistant", "content": reply})
                    bubble("tutor", reply)

                    errors = analysis.get("errors", [])
                    for err in errors:
                        linked = models.register_conversation_error(
                            wconn, err.get("error_type", "other"), err.get("span", ""),
                            err.get("correction", ""), err.get("hanzi", ""),
                            err.get("explanation", ""))
                        tag = " (added back to reviews)" if linked else ""
                        note(f"{err.get('span','')} -> {err.get('correction','')}\n"
                             f"{err.get('explanation','')}{tag}", ft.Colors.AMBER_300)
                    added = models.add_study_words(wconn, analysis.get("study_words", []))
                    if added:
                        note("added to your deck: " + " ".join(added), GREEN)
                    if not errors and not added:
                        note("no corrections, nicely done", ft.Colors.GREY_500)
                except Exception as ex:
                    note(f"Error: {ex}", ft.Colors.RED_300)
                finally:
                    try:
                        wconn.close()
                    except Exception:
                        pass
                    spinner.visible = False
                    field.disabled = False
                    page.update()

            threading.Thread(target=work, daemon=True).start()

        if chat["tutor"] is None:
            rebuild_tutor()

        level_dd = ft.Dropdown(value=chat["level"], width=140, on_change=on_level,
                               options=[ft.dropdown.Option("easy"), ft.dropdown.Option("medium"),
                                        ft.dropdown.Option("hard")])
        sidebar = ft.Container(
            ft.Column([ft.Text("Notes & corrections", weight=ft.FontWeight.BOLD),
                       ft.Divider(), notes], expand=True, spacing=6),
            width=300,
        )
        set_body(ft.Column([
            ft.Row([ft.Text("老师 (Lǎoshī)", size=20, weight=ft.FontWeight.BOLD),
                    ft.Container(expand=True), ft.Text("level:"), level_dd]),
            ft.Divider(),
            ft.Row([messages, ft.VerticalDivider(width=1), sidebar], expand=True),
            ft.Row([field, spinner, ft.FilledButton("Send", on_click=lambda e: send())]),
        ], expand=True, spacing=10))

    # ---------- Weak words ----------
    def view_weak():
        rows = models.weak_items(conn, limit=50)
        if not rows:
            set_body(ft.Column([ft.Text("No weak words yet", size=22, weight=ft.FontWeight.BOLD),
                                ft.Text("They show up here as you make mistakes drilling or chatting.")]))
            return
        lv = ft.ListView(expand=True, spacing=6)
        for r in rows:
            lv.controls.append(ft.Row([
                ft.Text(f"{r['score']:.1f}", width=44, color=ft.Colors.AMBER_300),
                ft.Text(r["hanzi"], width=70, size=18),
                ft.Text(r["pinyin"], width=110, color=GREEN),
                ft.Text(r["gloss"], expand=True, color=ft.Colors.GREY_300),
            ]))
        set_body(ft.Column([
            ft.Text("Weak words", size=22, weight=ft.FontWeight.BOLD),
            ft.Text("Recency-weighted: old mistakes fade, getting a word right removes it.",
                    color=ft.Colors.GREY_400),
            ft.Divider(), lv,
        ], expand=True))

    # ---------- Import ----------
    imp = {"path": None, "fields": [], "notes": []}
    file_picker = ft.FilePicker()
    page.overlay.append(file_picker)

    def view_import():
        status = ft.Text("", color=ft.Colors.GREY_400)
        mapping_area = ft.Column(spacing=10)

        def build_mapping():
            mapping_area.controls.clear()
            if not imp["fields"]:
                page.update()
                return
            opts = [ft.dropdown.Option(n) for n in imp["fields"]]
            none_opts = [ft.dropdown.Option("(none)")] + opts
            dd_hanzi = ft.Dropdown(label="hanzi", options=opts, width=260)
            dd_pinyin = ft.Dropdown(label="pinyin", options=none_opts, value="(none)", width=260)
            dd_gloss = ft.Dropdown(label="meaning", options=none_opts, value="(none)", width=260)
            dd_example = ft.Dropdown(label="example sentence", options=none_opts, value="(none)", width=260)
            result = ft.Text("")

            def idx_of(dd):
                v = dd.value
                if not v or v == "(none)":
                    return None
                return imp["fields"].index(v)

            def do_import(e):
                from mandarin import importer
                if dd_hanzi.value is None:
                    result.value = "Pick the hanzi field first."
                    page.update()
                    return
                added, dupes, empty = importer.import_notes(
                    conn, imp["notes"], idx_of(dd_hanzi), idx_of(dd_pinyin),
                    idx_of(dd_gloss), idx_of(dd_example), field_names=imp["fields"])
                total = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
                result.value = f"Imported {added} new, skipped {dupes} duplicate(s). Collection: {total}."
                result.color = GREEN
                page.update()

            mapping_area.controls += [
                ft.Text(f"{len(imp['notes'])} notes. Map the fields:"),
                dd_hanzi, dd_pinyin, dd_gloss, dd_example,
                ft.FilledButton("Import", on_click=do_import), result,
            ]
            page.update()

        def on_pick(e: ft.FilePickerResultEvent):
            if not e.files:
                return
            from mandarin import importer
            path = e.files[0].path
            try:
                fields, notes, skipped = importer.read_apkg(path)
            except importer.ApkgError as err:
                status.value = f"Could not read deck: {err}"
                status.color = ft.Colors.RED_300
                page.update()
                return
            imp.update(path=path, fields=fields, notes=notes)
            status.value = f"{path.split('/')[-1]}: {len(notes)} notes, fields = {', '.join(fields)}"
            status.color = ft.Colors.GREY_300
            build_mapping()

        file_picker.on_result = on_pick
        set_body(ft.Column([
            ft.Text("Import an Anki deck", size=22, weight=ft.FontWeight.BOLD),
            ft.Text("Pick a .apkg file, then choose which fields hold the word, pinyin and meaning."),
            ft.FilledButton("Choose .apkg file", icon=ft.Icons.UPLOAD_FILE,
                            on_click=lambda e: file_picker.pick_files(
                                allow_multiple=False, allowed_extensions=["apkg"])),
            status, ft.Divider(), mapping_area,
        ], expand=True, spacing=10, scroll=ft.ScrollMode.AUTO))

    # ---------- Settings ----------
    def view_settings():
        key_field = ft.TextField(label="Anthropic API key", password=True,
                                 can_reveal_password=True, value=settings_mod.load().get("api_key", ""),
                                 width=460)
        saved = ft.Text("")

        def save(e):
            settings_mod.set_api_key(key_field.value or "")
            saved.value = "Saved. Chat is ready to use."
            saved.color = GREEN
            page.update()

        set_body(ft.Column([
            ft.Text("Settings", size=22, weight=ft.FontWeight.BOLD),
            ft.Text("Your API key is stored locally in ~/.mandarin_tutor.json and never leaves your machine.",
                    color=ft.Colors.GREY_400),
            key_field, ft.FilledButton("Save", on_click=save), saved,
        ], spacing=12))

    # ---------- Navigation ----------
    views = [view_home, view_review, view_chat, view_weak, view_import, view_settings]

    def select(index):
        rail.selected_index = index
        views[index]()

    rail = ft.NavigationRail(
        selected_index=0, label_type=ft.NavigationRailLabelType.ALL,
        on_change=lambda e: select(e.control.selected_index),
        destinations=[
            ft.NavigationRailDestination(icon=ft.Icons.HOME, label="Home"),
            ft.NavigationRailDestination(icon=ft.Icons.SCHOOL, label="Review"),
            ft.NavigationRailDestination(icon=ft.Icons.CHAT, label="Chat"),
            ft.NavigationRailDestination(icon=ft.Icons.TRENDING_DOWN, label="Weak"),
            ft.NavigationRailDestination(icon=ft.Icons.UPLOAD_FILE, label="Import"),
            ft.NavigationRailDestination(icon=ft.Icons.SETTINGS, label="Settings"),
        ],
    )

    page.add(ft.Row([rail, ft.VerticalDivider(width=1), body], expand=True))
    view_home()


if __name__ == "__main__":
    ft.app(main)
