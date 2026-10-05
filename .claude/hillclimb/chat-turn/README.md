# Chat turn eval: two calls or one?

Compares three ways of handling one student message: `baseline` (today: reply, then a grading call),
`v1` (one combined call) and `v2` (the two calls in parallel).

- Test sentences: `evals/chat-turn/cases.json`, readable copy in `evals/chat-turn/CASES.md`.
- Runner: `node evals/chat-turn/run.mjs --flow .claude/hillclimb/chat-turn --variant baseline --model claude-opus-5`
- Summary table: `node evals/chat-turn/summarize.mjs --flow .claude/hillclimb/chat-turn` (also written to `metrics.md`).

What each number means:

- **Graded right**: a planted mistake was caught, or a correct sentence was left alone. A turn with no analysis never counts.
- **No extra flags**: nothing was flagged beyond the planted mistake.
- **Links card**: the correction names the flashcard it should pull forward.
- **Tutor in role**: a second model (`claude-sonnet-5-5`) read the tutor's reply and found no correction in it.
- **Ends question**: the reply ends with a question, as the tutor's brief asks.
