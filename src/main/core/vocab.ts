import type { Db } from './db'
import { weakItems } from './mistakes'

/**
 * Words the learner already knows: graduated to FSRS Review state and not on
 * the weak list. The chat hides pinyin over these unless the learner hovers.
 */
export function knownWords(db: Db, now: Date = new Date()): string[] {
  const weak = new Set(weakItems(db, now, Number.MAX_SAFE_INTEGER).map((item) => item.id))
  const rows = db.prepare('SELECT id, hanzi FROM items WHERE state = 2 ORDER BY id').all() as {
    id: number
    hanzi: string
  }[]
  return [...new Set(rows.filter((row) => !weak.has(row.id)).map((row) => row.hanzi))]
}
