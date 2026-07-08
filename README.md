# AI Mandarin learning tool

A command-line tool for learning Mandarin, combining spaced-repetition flashcards with a LLM chat tutor. It keeps a log of every mistake so that words that you struggle with in flashcards are introduced into the conversation with the LLM and mistakes made in conversation are brought up more often in reviews 

## Specific details

- Flashcards scheduled with FSRS (algorithm used by Anki)
- Import Anki decks into vocabulary database
- LLM chat-based tutor (in this case Claude) that you can talk to in Chinese at a beginner level.
- One shared mistake log for both flashcard failures and conversation slips.


## How to setup

```
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

The `chat` command needs an Anthropic API key:

```
export ANTHROPIC_API_KEY=(YOUR ANTHROPIC KEY)
```

## How to use

```
python main.py seed                   # load 40 starter HSK1 words
python main.py import deck.apkg        # import an Anki deck
python main.py add 猫 --pinyin mao --gloss cat
python main.py drill                   # review due cards
python main.py chat                    # talk to the tutor (needs API key)
python main.py chat --level hard       # easy | medium (default) | hard
python main.py weak                    # words you keep getting wrong
python main.py mistakes                # raw mistake log
python main.py stats
```

In `drill`, each card shows the hanzi (Chinese character). Press Enter to reveal, then grade 1-4 (Again / Hard / Good / Easy). New cards repeat more frequently until they are graded Easy which moves a card to a longer interval.

`chat` takes a `--level`: `easy` mixes in a lot of English with pinyin on everything, `medium` (the default) is mostly Chinese with pinyin only for new words, and `hard` is Chinese only with no pinyin unless you ask. 

## Importing an Anki deck

`import` reads a `.apkg` file, lists its fields, and asks which ones hold the hanzi, pinyin, meaning, and an example sentence (or takes them as flags):

```
python main.py import deck.apkg --dry-run    # preview the field mapping first
python main.py import deck.apkg --hanzi Simplified --pinyin Pinyin --gloss Meaning --example SentenceSimplified
```

HTML and audio markup is stripped and duplicates are skipped. I kept fields that are currently unmapped (audio, part of speech, and so on) in an `extra` JSON column for later use if these features are potentially introduced in the future.

## How the shared memory works

The `mistakes` table is append-only. "What you're weak at" is a score computed from it rather than a stored flag:

    score = sum of past mistakes, each weighted by age,
            minus sum of later correct recalls, weighted by age

A mistake's weight halves every 30 days, so old mistakes fade. Getting a word
right later subtracts from its score, so a word you have since mastered drops off
the list on its own. The half-life is a constant in `models.py`.

The chat tutor makes two Claude calls per turn: one replies naturally, and a second grades your message into structured JSON (errors plus any new vocabulary).
Logged mistakes that match a flashcard reschedule that card sooner. New words the tutor uses are added as cards with a generated example sentence. Your weak words and the words you are currently drilling are passed into the tutor's prompt so it reaches for your own vocabulary.

## Layout

```
mandarin/db.py         SQLite schema and connection
mandarin/scheduler.py  FSRS wrapper
mandarin/models.py     items, mistakes, the weak-word score
mandarin/importer.py   Anki .apkg reader
mandarin/tutor.py      the two Claude calls
mandarin/cli.py        commands
data/seed_hsk1.json    starter words
```

## Future plans

I want to add audio mode to allow voice conversations between the user and the LLM. If possible, adding some form of metric to grade pronunciation would add another level to the tool by being able to grade user's pronunciations and add this to the mistake log.

Furthermore, I want to eventually convert the tool into a desktop/web app interface rather than CLI for better ease of use; I will likely work on this in the next 2 months.