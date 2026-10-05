import Database from 'better-sqlite3'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from './db'
import { addItem, getItem, stats } from './items'
import { importLegacyDb, parsePythonIso } from './legacy'
import { listMistakes, weakItems } from './mistakes'
import { previewIntervals } from './scheduler'

// The schema exactly as the Python app created it (legacy/mandarin/db.py).
const LEGACY_SCHEMA = `
CREATE TABLE items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'vocab',
    hanzi      TEXT NOT NULL,
    pinyin     TEXT NOT NULL DEFAULT '',
    gloss      TEXT NOT NULL DEFAULT '',
    example    TEXT NOT NULL DEFAULT '',
    tags       TEXT NOT NULL DEFAULT '',
    extra      TEXT NOT NULL DEFAULT '{}',
    fsrs_card  TEXT NOT NULL,
    due        TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(hanzi, type)
);
CREATE TABLE mistakes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     INTEGER,
    ts          TEXT NOT NULL,
    source      TEXT NOT NULL,
    error_type  TEXT NOT NULL DEFAULT 'recall',
    user_said   TEXT NOT NULL DEFAULT '',
    expected    TEXT NOT NULL DEFAULT '',
    context     TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(item_id) REFERENCES items(id)
);
CREATE TABLE reviews (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id  INTEGER NOT NULL,
    ts       TEXT NOT NULL,
    rating   INTEGER NOT NULL,
    FOREIGN KEY(item_id) REFERENCES items(id)
);`

const NEW_CARD = JSON.stringify({
  due: '2026-07-04T23:05:11.120394+00:00',
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0,
  state: 0
})
const REVIEW_CARD = JSON.stringify({
  due: '2026-07-20T20:53:16.279807+00:00',
  stability: 15.4722,
  difficulty: 3.28285649513529,
  elapsed_days: 0,
  scheduled_days: 15,
  reps: 1,
  lapses: 0,
  state: 2,
  last_review: '2026-07-05T20:53:16.279807+00:00'
})

let dir: string
let legacyPath: string

function buildLegacy(): void {
  const legacy = new Database(legacyPath)
  legacy.exec(LEGACY_SCHEMA)
  const item = legacy.prepare(
    'INSERT INTO items (id, hanzi, pinyin, gloss, example, tags, extra, fsrs_card, due, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  item.run(
    3,
    '现在',
    'xiànzài',
    'now',
    '我现在很忙。',
    'anki',
    '{"Audio":"[sound:x.mp3]"}',
    NEW_CARD,
    '2026-07-04T23:05:11.120394+00:00',
    '2026-07-04T23:05:11.120394+00:00'
  )
  item.run(
    7,
    '叫',
    'jiào',
    'to be called',
    '',
    'anki',
    '{}',
    REVIEW_CARD,
    '2026-07-20T20:53:16.279807+00:00',
    '2026-07-04T23:05:11+00:00'
  )
  item.run(
    9,
    '猫',
    'māo',
    'cat',
    '',
    'chat',
    'not json',
    NEW_CARD,
    '2026-07-04T23:05:11.120394+00:00',
    '2026-07-08T19:04:40.902282+00:00'
  )
  const review = legacy.prepare('INSERT INTO reviews (id, item_id, ts, rating) VALUES (?, ?, ?, ?)')
  review.run(1, 7, '2026-07-05T20:53:16.279807+00:00', 4)
  review.run(2, 3, '2026-07-08T19:03:53.679949+00:00', 1)
  const mistake = legacy.prepare(
    'INSERT INTO mistakes (id, item_id, ts, source, error_type, user_said, expected, context, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  mistake.run(
    1,
    3,
    '2026-07-08T19:03:53.679949+00:00',
    'conversation',
    'wrong_word',
    '线在',
    '现在 (xiànzài)',
    '现在',
    'Wrong character.'
  )
  mistake.run(
    2,
    null,
    '2026-07-08T19:04:40.893411+00:00',
    'conversation',
    'tone',
    'gou',
    '狗 (gǒu)',
    '狗',
    'Third tone.'
  )
  legacy.close()
}

let db: Db
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mandarin-legacy-'))
  legacyPath = join(dir, 'mandarin.db')
  buildLegacy()
  db = openDatabase(join(dir, 'new.db'))
})

describe('parsePythonIso', () => {
  it('reads six-digit fractions, missing fractions and missing offsets as UTC', () => {
    expect(parsePythonIso('2026-07-05T20:53:16.279807+00:00', 0)).toBe(
      Date.UTC(2026, 6, 5, 20, 53, 16, 279)
    )
    expect(parsePythonIso('2026-07-04T23:05:11+00:00', 0)).toBe(Date.UTC(2026, 6, 4, 23, 5, 11))
    expect(parsePythonIso('2026-07-04T23:05:11', 0)).toBe(Date.UTC(2026, 6, 4, 23, 5, 11))
    expect(parsePythonIso('garbage', 42)).toBe(42)
    expect(parsePythonIso(null, 42)).toBe(42)
  })
})

describe('importLegacyDb', () => {
  it('copies cards, reviews and mistakes with their ids and FSRS state', () => {
    expect(importLegacyDb(db, legacyPath)).toEqual({
      items: 3,
      reviews: 2,
      mistakes: 2,
      backup: null
    })

    const fresh = getItem(db, 3)!
    expect(fresh).toMatchObject({
      hanzi: '现在',
      pinyin: 'xiànzài',
      tags: 'anki',
      state: 0,
      reps: 0,
      learning_steps: 0
    })
    expect(fresh.extra).toEqual({ Audio: '[sound:x.mp3]' })
    expect(fresh.last_review).toBeNull()
    expect(fresh.due).toBe(Date.UTC(2026, 6, 4, 23, 5, 11, 120))

    const reviewed = getItem(db, 7)!
    expect(reviewed).toMatchObject({ state: 2, stability: 15.4722, scheduled_days: 15, reps: 1 })
    expect(reviewed.due).toBe(Date.UTC(2026, 6, 20, 20, 53, 16, 279))
    expect(reviewed.last_review).toBe(Date.UTC(2026, 6, 5, 20, 53, 16, 279))
    expect(reviewed.created_at).toBe(Date.UTC(2026, 6, 4, 23, 5, 11))

    expect(getItem(db, 9)!.extra).toEqual({})

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>
    expect(review).toMatchObject({ item_id: 7, rating: 4, state: null, stability: null })

    const logged = listMistakes(db)
    expect(logged.map((m) => [m.id, m.item_id, m.source, m.error_type])).toEqual([
      [2, null, 'conversation', 'tone'],
      [1, 3, 'conversation', 'wrong_word']
    ])
  })

  it('leaves the imported cards usable by the scheduler and the weak score', () => {
    importLegacyDb(db, legacyPath)
    const now = new Date('2026-07-09T00:00:00Z')
    expect(stats(db, now)).toEqual({ words: 3, due: 2, reviews: 2, mistakes: 2 })
    expect(weakItems(db, now).map((w) => w.hanzi)).toEqual(['现在'])
    const intervals = previewIntervals(getItem(db, 7)!, new Date('2026-07-20T21:00:00Z'))
    expect(intervals[3]).toBeGreaterThan(intervals[1])
  })

  it('continues numbering after the highest imported id', () => {
    importLegacyDb(db, legacyPath)
    expect(addItem(db, { hanzi: '狗' })).toBe(10)
  })

  it('refuses a non-empty app unless told to replace, and backs up first', () => {
    addItem(db, { hanzi: '旧' })
    expect(() => importLegacyDb(db, legacyPath)).toThrowError(/already has 1 cards/)
    expect(getItem(db, 1)?.hanzi).toBe('旧')

    const backupPath = join(dir, 'backup.db')
    const result = importLegacyDb(db, legacyPath, { replace: true, backupPath })
    expect(result).toEqual({ items: 3, reviews: 2, mistakes: 2, backup: backupPath })
    expect(existsSync(backupPath)).toBe(true)
    const backup = new Database(backupPath, { readonly: true })
    expect(backup.prepare('SELECT hanzi FROM items').all()).toEqual([{ hanzi: '旧' }])
    backup.close()
    expect(db.prepare('SELECT hanzi FROM items ORDER BY id').all()).toEqual([
      { hanzi: '现在' },
      { hanzi: '叫' },
      { hanzi: '猫' }
    ])
  })

  it('rejects files that are missing or are not a legacy database', () => {
    expect(() => importLegacyDb(db, join(dir, 'nope.db'))).toThrowError(/Could not open/)
    const other = join(dir, 'other.db')
    new Database(other).exec('CREATE TABLE notes (id INTEGER)').close()
    expect(() => importLegacyDb(db, other)).toThrowError(/isn't a database from the Python version/)
    expect(() => importLegacyDb(db, join(dir, 'new.db'))).toThrowError(
      /isn't a database from the Python version/
    )
  })
})
