# AI Mandarin tutor

A desktop app (with a command-line version too) for learning Mandarin. It combines spaced-repetition flashcards with an LLM chat tutor, and keeps one shared log of every mistake: words you struggle with in flashcards get worked into the conversation with the tutor, and mistakes you make while chatting are brought up more often in your reviews. Runs on Mac and Windows.

## Features

- Spaced-repetition flashcards scheduled with FSRS (the algorithm Anki uses).
- Import your existing Anki decks.
- An LLM chat tutor (Claude) you can talk to in Chinese, with easy/medium/hard difficulty.
- One shared mistake log that ties the flashcards and the conversation together.

## Setup

```
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

## Running the desktop app

```
./.venv/bin/flet run app.py
```

This opens a window with Home, Review, Chat, Weak-words, Import and Settings screens. The user enters their Anthropic API key on the Settings screen to use the tutor; it is saved locally in `~/.mandarin_tutor.json` and is never committed.

To turn it into a standalone application you can double-click, build it for your platform (this needs the Flutter SDK, which `flet build` will prompt to install):

```
./.venv/bin/flet build macos      # produces a .app; run on a Mac
flet build windows                 # produces an .exe; run on Windows
```

You don't have to build it to use it. `flet run app.py` works from source on both
Mac and Windows.

## Command-line version

Everything also works from the terminal, on the same database as the app:

```
python main.py seed                   # load 40 starter HSK1 words
python main.py import deck.apkg        # import an Anki deck
python main.py add 猫 --pinyin mao --gloss cat
python main.py drill                   # review due cards
python main.py chat                    # talk to the tutor (needs an API key)
python main.py chat --level hard       # easy | medium (default) | hard
python main.py weak                    # words you keep getting wrong
python main.py mistakes                # raw mistake log
python main.py stats
```

The command-line `chat` reads the key from the environment:

```
export ANTHROPIC_API_KEY=(your Anthropic key)
```

In `drill`, each card shows the hanzi. Press Enter to reveal, then grade 1-4
(Again / Hard / Good / Easy). New cards repeat until they stick; grading Easy moves a card to a longer interval.

The `--level` on chat sets how hard the tutor is: `easy` mixes in a lot of English with pinyin on everything, `medium` (the default) is mostly Chinese with pinyin only for new words, and `hard` is Chinese only with no pinyin unless you ask.

## Importing an Anki deck

Import reads a `.apkg` file, lists its fields, and lets you choose which ones hold the hanzi, pinyin, meaning and an example sentence. In the app this is the Import screen; from the command line it takes flags:

```
python main.py import deck.apkg --dry-run    # preview the field mapping first
python main.py import deck.apkg --hanzi Simplified --pinyin Pinyin --gloss Meaning --example SentenceSimplified
```

HTML and audio markup is stripped and duplicates are skipped. I keep the fields I don't map (audio, part of speech, and so on) in an `extra` JSON column, so they're there if I add features that use them later.

## How the shared memory works

The `mistakes` table is append-only. "What you're weak at" is a score computed from it rather than a stored flag:

    score = sum of past mistakes, each weighted by age,
            minus sum of later correct recalls, weighted by age

A mistake's weight halves every 30 days, so old mistakes fade. Getting a word right later subtracts from its score, so a word you have since mastered drops off the list on its own. The half-life is a constant in `models.py`.

The chat tutor makes two Claude calls per turn: one replies naturally, and a second grades your message into structured JSON (errors plus any new vocabulary). Mistakes that match a flashcard reschedule that card sooner, and new words the tutor uses are added as cards with an example sentence. Your weak words and the words you are currently drilling are passed into the tutor's prompt so it reaches for your own vocabulary.

## Layout

```
app.py                 desktop app (Flet)
main.py                command-line entry point
mandarin/db.py         SQLite schema and connection
mandarin/scheduler.py  FSRS wrapper
mandarin/models.py     items, mistakes, the weak-word score
mandarin/importer.py   Anki .apkg reader
mandarin/tutor.py      the two Claude calls
mandarin/cli.py        command-line commands
mandarin/settings.py   local API-key storage for the app
data/seed_hsk1.json    starter words
```

## Future plans

I want to add an audio mode for voice conversations between the user and the tutor. If possible I'd like to grade pronunciation and feed that into the same mistake log, so speaking mistakes get reviewed the same way as everything else.
