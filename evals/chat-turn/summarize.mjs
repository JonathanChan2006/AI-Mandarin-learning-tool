#!/usr/bin/env node
// Reads a flow directory written by run.mjs and prints one comparison table
// across variants. Every number is computed from results.jsonl / errors.jsonl.
//
//   node evals/chat-turn/summarize.mjs --flow .claude/hillclimb/chat-turn
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flow = args[args.indexOf('--flow') + 1]
if (!flow || !existsSync(flow)) {
  console.error('usage: node evals/chat-turn/summarize.mjs --flow DIR')
  process.exit(2)
}

// $ per million tokens (first-party API). Cache writes 1.25x input, cache reads 0.1x input.
const PRICES = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5-5': { in: 2, out: 10 }
}
const LABELS = { baseline: 'Two calls, in sequence (today)', v1: 'One combined call', v2: 'Two calls, in parallel' }

const cost = (model, usage) => {
  const price = PRICES[model]
  if (!price || !usage) return null
  const tokens =
    (usage.input_tokens ?? 0) +
    1.25 * (usage.cache_creation_input_tokens ?? 0) +
    0.1 * (usage.cache_read_input_tokens ?? 0)
  return (tokens * price.in + (usage.output_tokens ?? 0) * price.out) / 1e6
}
const readJsonl = (path) =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    : []
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
// Wilson 95% interval for a proportion: honest at small n and near 0 or 100%.
const wilson = (passes, n) => {
  if (!n) return null
  const z = 1.96
  const p = passes / n
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n)
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n)
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}
const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`)
const rate = (rows, metric) => {
  const values = rows.map((r) => r.grade?.[metric]).filter((v) => typeof v === 'number')
  if (!values.length) return 'n/a'
  const passes = values.filter((v) => v === 1).length
  const [lo, hi] = wilson(passes, values.length)
  return `${pct(passes / values.length)} (${passes}/${values.length}, ${pct(lo)}–${pct(hi)})`
}
const seconds = (x) => (x == null ? 'n/a' : `${x.toFixed(1)} s`)
const dollars = (x) => (x == null ? 'not measured' : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`)

const cases = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'))
const tagsOf = new Map(cases.map((c) => [c.id, c.tags]))
const variants = readdirSync(flow)
  .filter((name) => /^(baseline|v[1-9]\d*)$/.test(name) && existsSync(join(flow, name, 'results.jsonl')))
  .sort((a, b) => (a === 'baseline' ? -1 : b === 'baseline' ? 1 : a.localeCompare(b, undefined, { numeric: true })))

const data = {}
for (const variant of variants) {
  const rows = readJsonl(join(flow, variant, 'results.jsonl')).filter((r) => (r.status ?? 'ok') === 'ok')
  const errors = readJsonl(join(flow, variant, 'errors.jsonl'))
  data[variant] = { rows, errors }
}

const lines = []
const say = (text = '') => lines.push(text)
say('# Chat turn: two calls or one?')
say()
say(`Flow \`${flow}\`. Built ${new Date().toISOString()}. Percentages show passes/attempts and a 95% interval.`)
say()
const column = (variant) => LABELS[variant] ?? variant
say(`| | ${variants.map(column).join(' | ')} |`)
say(`|---|${variants.map(() => '---').join('|')}|`)
const row = (label, fn) => say(`| ${label} | ${variants.map((v) => fn(data[v])).join(' | ')} |`)
const withTag = (rows, tag) => rows.filter((r) => (tagsOf.get(r.prompt_id) ?? r.tags ?? []).includes(tag))

row('Scored attempts', (d) => String(d.rows.length))
row('**Mistakes caught**', (d) => rate(withTag(d.rows, 'error'), 'graded_right'))
row('…that need the tutor\'s question', (d) => rate(withTag(d.rows, 'needs-context'), 'graded_right'))
row('…typed in pinyin', (d) => rate(withTag(d.rows, 'pinyin'), 'graded_right'))
row('**Correct sentences left alone**', (d) => rate(withTag(d.rows, 'correct'), 'graded_right'))
row('No extra flags', (d) => rate(d.rows, 'no_false_flag'))
row('Correction links to the right card', (d) => rate(d.rows, 'links_card'))
row('**Tutor does not correct in its reply**', (d) => rate(d.rows, 'no_correction'))
row('Reply ends with a question', (d) => rate(d.rows, 'ends_question'))
row('Turns with no analysis at all', (d) => String(d.rows.filter((r) => r.analysis_failed === 1).length))
row('Reply sentences (mean)', (d) => {
  const m = mean(d.rows.map((r) => r.reply_sentences).filter((v) => typeof v === 'number'))
  return m == null ? 'n/a' : m.toFixed(1)
})
row('**Time to first word (median)**', (d) => seconds(median(d.rows.map((r) => r.first_token_s).filter((v) => typeof v === 'number'))))
row('**Time until corrections (median)**', (d) => seconds(median(d.rows.map((r) => r.total_s).filter((v) => typeof v === 'number'))))
row('API calls per turn', (d) => {
  const m = mean(d.rows.map((r) => r.api_calls).filter((v) => typeof v === 'number'))
  return m == null ? 'n/a' : m.toFixed(1)
})
row('**Cost per turn (app only)**', (d) => dollars(mean(d.rows.map((r) => cost(r.model, r.usage)).filter((v) => v != null))))
row('Failed attempts (not scored)', (d) => {
  if (!d.errors.length) return '0'
  const byClass = {}
  for (const e of d.errors) byClass[e.failure_class ?? 'error'] = (byClass[e.failure_class ?? 'error'] ?? 0) + 1
  return Object.entries(byClass).map(([k, n]) => `${n} ${k}`).join(', ')
})
row('Spend on this run (app + judge + failures)', (d) => {
  const parts = [
    ...d.rows.map((r) => cost(r.model, r.usage)),
    ...d.rows.map((r) => (r.judge_usage ? cost(r.judge_model, r.judge_usage) : 0)),
    ...d.errors.map((e) => (e.usage ? cost(e.model, e.usage) : 0)),
    ...d.errors.map((e) => (e.judge_usage ? cost(e.judge_model, e.judge_usage) : 0))
  ]
  return parts.some((p) => p == null) ? 'not measured' : dollars(parts.reduce((a, b) => a + b, 0))
})

// Paired comparison with baseline on the headline metric: same cases, so case difficulty cancels.
if (variants.includes('baseline') && variants.length > 1) {
  say()
  say('## Paired difference from today\'s design (graded right, all cases)')
  say()
  const perCase = (variant) => {
    const by = new Map()
    for (const r of data[variant].rows) {
      if (typeof r.grade?.graded_right !== 'number') continue
      by.set(r.prompt_id, [...(by.get(r.prompt_id) ?? []), r.grade.graded_right])
    }
    return new Map([...by].map(([id, values]) => [id, mean(values)]))
  }
  const base = perCase('baseline')
  say('| Design | Cases compared | Mean difference | 95% interval | Verdict |')
  say('|---|---|---|---|---|')
  for (const variant of variants.filter((v) => v !== 'baseline')) {
    const other = perCase(variant)
    const deltas = [...other].filter(([id]) => base.has(id)).map(([id, value]) => value - base.get(id))
    if (deltas.length < 2) {
      say(`| ${column(variant)} | ${deltas.length} | n/a | n/a | too few cases |`)
      continue
    }
    const m = mean(deltas)
    const sd = Math.sqrt(deltas.reduce((a, d) => a + (d - m) ** 2, 0) / (deltas.length - 1))
    const half = (1.96 * sd) / Math.sqrt(deltas.length)
    const verdict = m - half > 0 ? 'better than today' : m + half < 0 ? 'worse than today' : 'within noise'
    const signed = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} pts`
    say(`| ${column(variant)} | ${deltas.length} | ${signed(m)} | ${signed(m - half)} to ${signed(m + half)} | ${verdict} |`)
  }
}

const text = lines.join('\n') + '\n'
writeFileSync(join(flow, 'metrics.md'), text)
process.stdout.write(text)
