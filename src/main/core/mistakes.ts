import type { Db } from './db'
import { rowToItem } from './items'
import type { Mistake, MistakeSource, WeakItem } from '@shared/types'

export interface NewMistake {
  item_id: number | null
  source: MistakeSource
  error_type?: string
  user_said?: string
  expected?: string
  context?: string
  note?: string
}

/** The mistakes table is append-only; "what you're weak at" is derived from it. */
export function logMistake(db: Db, mistake: NewMistake, now: Date = new Date()): number {
  const info = db
    .prepare(
      `INSERT INTO mistakes (item_id, ts, source, error_type, user_said, expected, context, note)
       VALUES (@item_id, @ts, @source, @error_type, @user_said, @expected, @context, @note)`
    )
    .run({
      item_id: mistake.item_id,
      ts: now.getTime(),
      source: mistake.source,
      error_type: mistake.error_type ?? 'recall',
      user_said: mistake.user_said ?? '',
      expected: mistake.expected ?? '',
      context: mistake.context ?? '',
      note: mistake.note ?? ''
    })
  return Number(info.lastInsertRowid)
}

export function listMistakes(db: Db, limit = 100, offset = 0): Mistake[] {
  return db
    .prepare('SELECT * FROM mistakes ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Mistake[]
}

/** A mistake's weight halves every HALF_LIFE_DAYS, so old mistakes fade. */
export const HALF_LIFE_DAYS = 30
/** How much one later correct recall (Good or Easy) subtracts. */
export const SUCCESS_WEIGHT = 1
/** Scores at or below this are treated as "no longer weak". */
export const WEAK_THRESHOLD = 0.05

const DAY_MS = 86_400_000

export function decay(ts: number, nowMs: number): number {
  const ageDays = (nowMs - ts) / DAY_MS
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

/**
 * Words ranked by a fading struggle score:
 *   score = Σ decay(mistake) − SUCCESS_WEIGHT · Σ decay(correct recall)
 * Old mistakes fade out; getting a word right later pushes it off the list.
 */
export function weakItems(db: Db, now: Date = new Date(), limit = 10): WeakItem[] {
  const nowMs = now.getTime()
  const scores = new Map<number, number>()

  const mistakes = db
    .prepare('SELECT item_id, ts FROM mistakes WHERE item_id IS NOT NULL ORDER BY id')
    .all() as { item_id: number; ts: number }[]
  for (const row of mistakes) {
    scores.set(row.item_id, (scores.get(row.item_id) ?? 0) + decay(row.ts, nowMs))
  }

  const recalls = db
    .prepare('SELECT item_id, ts FROM reviews WHERE rating >= 3 ORDER BY id')
    .all() as { item_id: number; ts: number }[]
  for (const row of recalls) {
    scores.set(row.item_id, (scores.get(row.item_id) ?? 0) - SUCCESS_WEIGHT * decay(row.ts, nowMs))
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > WEAK_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
  if (ranked.length === 0) return []

  const placeholders = ranked.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT * FROM items WHERE id IN (${placeholders})`)
    .all(...ranked.map(([id]) => id)) as Parameters<typeof rowToItem>[0][]
  const byId = new Map(rows.map((row) => [row.id, rowToItem(row)]))

  return ranked.flatMap(([id, score]) => {
    const item = byId.get(id)
    return item ? [{ ...item, score: Math.round(score * 100) / 100 }] : []
  })
}
