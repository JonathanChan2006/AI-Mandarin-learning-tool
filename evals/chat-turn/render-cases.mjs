// Renders cases.json as CASES.md so the test sentences can be reviewed by eye.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'))

const fence = (text) => {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}\n${text}\n${ticks}`
}
const expectation = (c) => {
  if (!c.expected) return 'No mistakes: the grader should stay silent'
  return `One mistake. Fix should contain: ${c.expected.fix_any.join(' / ')}`
}
const cell = (text) => String(text).replace(/\|/g, '\\|')

const groups = [
  ['error', 'Sentences with one known mistake'],
  ['correct', 'Correct sentences that must not be flagged']
]

let out = '# Test sentences for the chat-turn eval\n\n'
out += `${cases.length} cases. Each one is a tutor line followed by the student's reply.\n\n`
out += '| id | group | type | source | student wrote | expected |\n|---|---|---|---|---|---|\n'
for (const c of cases) {
  out += `| ${c.id} | ${c.tags[0]} | ${c.tags[1]} | ${c.tags[2]} | ${cell(c.student)} | ${cell(expectation(c))} |\n`
}
for (const [key, title] of groups) {
  const group = cases.filter((c) => c.tags[0] === key)
  out += `\n## ${title} (${group.length})\n`
  for (const c of group) {
    out += `\n### ${c.id}\n\nTutor says:\n\n${fence(c.tutor)}\n\nStudent replies:\n\n${fence(c.student)}\n\n`
    out += `Meaning: ${c.meaning}\n\n`
    if (c.expected) {
      out += `What is wrong: ${c.expected.why}\n\n`
      out += `Counts as caught if a correction contains: ${c.expected.fix_any.join(' / ')}\n\n`
      if (c.expected.card) out += `Flashcard it should link to: ${c.expected.card}\n\n`
    } else {
      out += 'Expected: no mistakes flagged.\n\n'
    }
    if (c.note) out += `Note: ${c.note}\n\n`
  }
}
writeFileSync(join(here, 'CASES.md'), out)
const count = (key) => cases.filter((c) => c.tags[0] === key).length
console.log(
  `CASES.md written: ${cases.length} cases (${count('error')} with a mistake, ${count('correct')} correct)`
)
