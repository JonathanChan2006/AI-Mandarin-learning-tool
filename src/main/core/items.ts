import Database from 'better-sqlite3'
import type { Db } from './db'
import { gradeCard, newCardState } from './scheduler'
import type { ActiveWord, CardState, Grade, Item, Stats, StudyWord } from '@shared/types'

export interface NewItem {
  hanzi: string
  pinyin?: string
  gloss?: string
  example?: string
  type?: string
  tags?: string
  extra?: Record<string, unknown>
}

interface ItemRow extends Omit<Item, 'extra'> {
  extra: string
}

export function rowToItem(row: ItemRow): Item {
  let extra: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(row.extra)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      extra = parsed as Record<string, unknown>
    }
  } catch {
    // A corrupt extra blob should not hide the card.
  }
  return { ...row, extra }
}

const ITEM_COLUMNS =
  'type, hanzi, pinyin, gloss, example, tags, extra, due, stability, difficulty, elapsed_days, ' +
  'scheduled_days, learning_steps, reps, lapses, state, last_review, created_at'

/**
 * Insert a word with a fresh FSRS card. Returns the new id, or null when the
 * same hanzi already exists with the same type (the only dedupe rule).
 */
export function addItem(db: Db, input: NewItem, now: Date = new Date()): number | null {
  const card = newCardState(now)
  try {
    const info = db
      .prepare(
        `INSERT INTO items (${ITEM_COLUMNS}) VALUES (
          @type, @hanzi, @pinyin, @gloss, @example, @tags, @extra, @due, @stability, @difficulty,
          @elapsed_days, @scheduled_days, @learning_steps, @reps, @lapses, @state, @last_review, @created_at)`
      )
      .run({
        ...card,
        type: input.type ?? 'vocab',
        hanzi: input.hanzi,
        pinyin: input.pinyin ?? '',
        gloss: input.gloss ?? '',
        example: input.example ?? '',
        tags: input.tags ?? '',
        extra: JSON.stringify(input.extra ?? {}),
        created_at: now.getTime()
      })
    return Number(info.lastInsertRowid)
  } catch (error) {
    if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return null
    }
    throw error
  }
}

export function getItem(db: Db, id: number): Item | undefined {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined
  return row ? rowToItem(row) : undefined
}

export function findByHanzi(db: Db, hanzi: string): Item | undefined {
  if (!hanzi) return undefined
  const row = db.prepare('SELECT * FROM items WHERE hanzi = ? ORDER BY id LIMIT 1').get(hanzi) as
    ItemRow | undefined
  return row ? rowToItem(row) : undefined
}

/** Every card due at `now`, oldest due first. */
export function dueItems(db: Db, now: Date = new Date()): Item[] {
  const rows = db
    .prepare('SELECT * FROM items WHERE due <= ? ORDER BY due ASC, id ASC')
    .all(now.getTime()) as ItemRow[]
  return rows.map(rowToItem)
}

/** When the next not-yet-due card becomes due, or null if nothing is scheduled. */
export function nextDueAt(db: Db, now: Date = new Date()): number | null {
  const row = db.prepare('SELECT MIN(due) AS next FROM items WHERE due > ?').get(now.getTime()) as {
    next: number | null
  }
  return row.next
}

export function countItems(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n
}

export function stats(db: Db, now: Date = new Date()): Stats {
  const count = (sql: string, ...params: unknown[]): number =>
    (db.prepare(sql).get(...params) as { n: number }).n
  return {
    words: count('SELECT COUNT(*) AS n FROM items'),
    due: count('SELECT COUNT(*) AS n FROM items WHERE due <= ?', now.getTime()),
    reviews: count('SELECT COUNT(*) AS n FROM reviews'),
    mistakes: count('SELECT COUNT(*) AS n FROM mistakes')
  }
}

/**
 * Reschedule a card with FSRS and record the review. Does not log mistakes;
 * callers decide that (see review.ts).
 */
export function applyGrade(
  db: Db,
  item: Item,
  grade: Grade,
  now: Date = new Date()
): { card: CardState; intervalMs: number } {
  const { card, log } = gradeCard(item, grade, now)
  db.transaction(() => {
    db.prepare(
      `UPDATE items SET due = @due, stability = @stability, difficulty = @difficulty,
         elapsed_days = @elapsed_days, scheduled_days = @scheduled_days, learning_steps = @learning_steps,
         reps = @reps, lapses = @lapses, state = @state, last_review = @last_review
       WHERE id = @id`
    ).run({ ...card, id: item.id })
    db.prepare(
      `INSERT INTO reviews (item_id, ts, rating, state, due, stability, difficulty, elapsed_days,
         last_elapsed_days, scheduled_days, learning_steps)
       VALUES (@item_id, @ts, @rating, @state, @due, @stability, @difficulty, @elapsed_days,
         @last_elapsed_days, @scheduled_days, @learning_steps)`
    ).run({ ...log, item_id: item.id, ts: now.getTime() })
  })()
  return { card, intervalMs: card.due - now.getTime() }
}

/** Add words picked up in conversation as new cards. Returns the hanzi actually added. */
export function addStudyWords(
  db: Db,
  words: StudyWord[],
  tags = 'chat',
  now: Date = new Date()
): string[] {
  const added: string[] = []
  db.transaction(() => {
    for (const word of words) {
      const hanzi = word.hanzi.trim()
      if (!hanzi) continue
      const id = addItem(
        db,
        {
          hanzi,
          pinyin: word.pinyin.trim(),
          gloss: word.gloss.trim(),
          example: word.example.trim(),
          tags
        },
        now
      )
      if (id !== null) added.push(hanzi)
    }
  })()
  return added
}

/** Most recently reviewed words, for the tutor to reuse in conversation. */
export function activeWords(db: Db, limit = 12): ActiveWord[] {
  return db
    .prepare(
      `SELECT i.hanzi, i.pinyin, i.gloss, MAX(r.ts) AS last_seen
       FROM items i JOIN reviews r ON r.item_id = i.id
       GROUP BY i.id
       ORDER BY last_seen DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row) => {
      const { hanzi, pinyin, gloss } = row as ActiveWord & { last_seen: number }
      return { hanzi, pinyin, gloss }
    })
}
