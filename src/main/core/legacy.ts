import Database from 'better-sqlite3'
import type { Db } from './db'
import { AppError } from '@shared/errors'

/**
 * One-off import of the database written by the Python version of this app:
 * items carried a py-fsrs card as JSON and every timestamp was an ISO string.
 * Ids are preserved so reviews and mistakes keep pointing at the right cards.
 */

export interface LegacyImportOptions {
  /** Replace whatever is already in the app. Without it a non-empty app is refused. */
  replace?: boolean
  /** Where to save a copy of the current data before replacing it. */
  backupPath?: string
}

export interface LegacyImportResult {
  items: number
  reviews: number
  mistakes: number
  /** Path of the backup taken before replacing, if any. */
  backup: string | null
}

/**
 * Python's datetime.isoformat(): up to six fractional digits and a +00:00
 * offset. Trim to milliseconds so every JS engine parses it the same way.
 */
export function parsePythonIso(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || value === '') return fallback
  let iso = value.replace(/(\.\d{3})\d+/, '$1')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) iso += 'Z'
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? fallback : ms
}

interface LegacyCard {
  due?: unknown
  stability?: unknown
  difficulty?: unknown
  elapsed_days?: unknown
  scheduled_days?: unknown
  reps?: unknown
  lapses?: unknown
  state?: unknown
  last_review?: unknown
}

function parseCard(json: unknown): LegacyCard {
  if (typeof json !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as LegacyCard) : {}
  } catch {
    return {}
  }
}

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const integer = (value: unknown): number => Math.max(0, Math.trunc(number(value)))
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function jsonObject(value: unknown): string {
  if (typeof value !== 'string') return '{}'
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? value : '{}'
  } catch {
    return '{}'
  }
}

function columns(source: Db, table: string): Set<string> {
  const rows = source.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

function assertLegacySchema(source: Db): void {
  const items = columns(source, 'items')
  const ok =
    ['id', 'hanzi', 'fsrs_card', 'created_at'].every((column) => items.has(column)) &&
    ['id', 'item_id', 'ts', 'rating'].every((column) => columns(source, 'reviews').has(column)) &&
    ['id', 'ts', 'source'].every((column) => columns(source, 'mistakes').has(column))
  if (!ok) {
    throw new AppError(
      'VALIDATION',
      "That file isn't a database from the Python version of this app."
    )
  }
}

export function importLegacyDb(
  db: Db,
  legacyPath: string,
  options: LegacyImportOptions = {},
  now: Date = new Date()
): LegacyImportResult {
  let source: Db
  try {
    source = new Database(legacyPath, { readonly: true, fileMustExist: true })
  } catch {
    throw new AppError('NOT_FOUND', `Could not open ${legacyPath}.`)
  }

  try {
    try {
      assertLegacySchema(source)
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError(
        'VALIDATION',
        "That file isn't a database from the Python version of this app."
      )
    }

    const existing = (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n
    if (existing > 0 && !options.replace) {
      throw new AppError(
        'DB_NOT_EMPTY',
        `This app already has ${existing} cards. Importing replaces them with your old data.`
      )
    }

    // Keep a copy of what is about to be replaced. VACUUM cannot run inside a transaction.
    let backup: string | null = null
    if (existing > 0 && options.backupPath) {
      db.prepare('VACUUM INTO ?').run(options.backupPath)
      backup = options.backupPath
    }

    const items = source.prepare('SELECT * FROM items ORDER BY id').all() as Record<
      string,
      unknown
    >[]
    const reviews = source
      .prepare('SELECT id, item_id, ts, rating FROM reviews ORDER BY id')
      .all() as Record<string, unknown>[]
    const mistakes = source.prepare('SELECT * FROM mistakes ORDER BY id').all() as Record<
      string,
      unknown
    >[]
    const nowMs = now.getTime()
    const result: LegacyImportResult = { items: 0, reviews: 0, mistakes: 0, backup }

    db.transaction(() => {
      if (existing > 0) {
        db.exec('DELETE FROM mistakes; DELETE FROM reviews; DELETE FROM items;')
        db.exec("DELETE FROM sqlite_sequence WHERE name IN ('items', 'reviews', 'mistakes')")
      }

      const insertItem = db.prepare(
        `INSERT INTO items (id, type, hanzi, pinyin, gloss, example, tags, extra, due, stability,
           difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, created_at)
         VALUES (@id, @type, @hanzi, @pinyin, @gloss, @example, @tags, @extra, @due, @stability,
           @difficulty, @elapsed_days, @scheduled_days, 0, @reps, @lapses, @state, @last_review, @created_at)`
      )
      const itemIds = new Set<number>()
      for (const row of items) {
        const card = parseCard(row.fsrs_card)
        const state = integer(card.state)
        insertItem.run({
          id: row.id,
          type: text(row.type) || 'vocab',
          hanzi: text(row.hanzi),
          pinyin: text(row.pinyin),
          gloss: text(row.gloss),
          example: text(row.example),
          tags: text(row.tags),
          extra: jsonObject(row.extra),
          due: parsePythonIso(card.due ?? row.due, nowMs),
          stability: number(card.stability),
          difficulty: number(card.difficulty),
          elapsed_days: integer(card.elapsed_days),
          scheduled_days: integer(card.scheduled_days),
          reps: integer(card.reps),
          lapses: integer(card.lapses),
          state: state <= 3 ? state : 0,
          last_review: card.last_review ? parsePythonIso(card.last_review, nowMs) : null,
          created_at: parsePythonIso(row.created_at, nowMs)
        })
        itemIds.add(row.id as number)
        result.items++
      }

      // Legacy reviews only recorded the rating; the FSRS log columns stay NULL.
      const insertReview = db.prepare(
        'INSERT INTO reviews (id, item_id, ts, rating) VALUES (@id, @item_id, @ts, @rating)'
      )
      for (const row of reviews) {
        const rating = integer(row.rating)
        if (!itemIds.has(row.item_id as number) || rating < 1 || rating > 4) continue
        insertReview.run({
          id: row.id,
          item_id: row.item_id,
          ts: parsePythonIso(row.ts, nowMs),
          rating
        })
        result.reviews++
      }

      const insertMistake = db.prepare(
        `INSERT INTO mistakes (id, item_id, ts, source, error_type, user_said, expected, context, note)
         VALUES (@id, @item_id, @ts, @source, @error_type, @user_said, @expected, @context, @note)`
      )
      for (const row of mistakes) {
        insertMistake.run({
          id: row.id,
          item_id: itemIds.has(row.item_id as number) ? row.item_id : null,
          ts: parsePythonIso(row.ts, nowMs),
          source: row.source === 'flashcard' ? 'flashcard' : 'conversation',
          error_type: text(row.error_type) || 'recall',
          user_said: text(row.user_said),
          expected: text(row.expected),
          context: text(row.context),
          note: text(row.note)
        })
        result.mistakes++
      }
    })()

    return result
  } finally {
    source.close()
  }
}
