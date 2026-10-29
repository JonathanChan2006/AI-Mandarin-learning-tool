# AI Mandarin Tutor

I've been using a lot of Anki flashcards to learn Mandarin vocab: I wanted to experiment with using AI as a "tutor" for conversations. To combine the two I've built this desktop app for my own use. Runs on Mac and Windows.

## Versions

v1: Python command line tool. Flashcards with FSRS (the algorithm Anki uses), a Claude chat tutor, Anki deck import, and a mistake log that links them.

v2: Desktop app in Python with Flet. Same engine, with screens for review, chat, weak words and import.

v3: Rebuilt desktop app in TypeScript + Electron + React. The tutor's replies stream in, and pinyin shows above its messages but hides for words I already know.

v1 and v2 are in the `legacy` folder.

## Tech stack

- Electron, React, TypeScript
- SQLite
- FSRS (flashcard timing)
- Claude API (LLM tutor)
- Tailwind, Vitest, Playwright

## Run it

```
npm install
npm run dev
```

Put your Claude API key into the program in the settings tab to get access to the "tutor" function
