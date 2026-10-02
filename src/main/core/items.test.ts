import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, SCHEMA_VERSION, type Db } from './db'
import {
  activeWords,
  addItem,
  addStudyWords,
  applyGrade,
  countItems,
  dueItems,
  findByHanzi,
  getItem,
  nextDueAt,
  stats
} from './items'

const now = new Date('2026-09-28T12:00:00Z')
const MINUTE = 60_000

let db: Db
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('openDatabase', () => {
  it('runs every migration once', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})

describe('addItem', () => {
  it('stores the word with a fresh card and returns its id', () => {
    const id = addItem(
      db,
      { hanzi: '猫', pinyin: 'māo', gloss: 'cat', extra: { pos: 'noun' } },
      now
    )
    expect(id).toBe(1)
    const item = getItem(db, 1)!
    expect(item.hanzi).toBe('猫')
    expect(item.type).toBe('vocab')
    expect(item.extra).toEqual({ pos: 'noun' })
    expect(item.due).toBe(now.getTime())
    expect(item.state).toBe(0)
    expect(item.last_review).toBeNull()
    expect(item.created_at).toBe(now.getTime())
  })

  it('returns null for the same hanzi and type, but allows another type', () => {
    expect(addItem(db, { hanzi: '猫' }, now)).toBe(1)
    expect(addItem(db, { hanzi: '猫' }, now)).toBeNull()
    expect(addItem(db, { hanzi: '猫', type: 'grammar' }, now)).toBe(2)
    expect(countItems(db)).toBe(2)
  })
})

describe('findByHanzi', () => {
  it('matches exactly, ignores type, and rejects empty input', () => {
    addItem(db, { hanzi: '猫' }, now)
    expect(findByHanzi(db, '猫')?.id).toBe(1)
    expect(findByHanzi(db, '猫咪')).toBeUndefined()
    expect(findByHanzi(db, '')).toBeUndefined()
  })
})

describe('dueItems and nextDueAt', () => {
  it('includes cards due now, excludes future ones, oldest first', () => {
    const later = new Date(now.getTime() + 10 * MINUTE)
    addItem(db, { hanzi: '一' }, later)
    addItem(db, { hanzi: '二' }, now)
    addItem(db, { hanzi: '三' }, new Date(now.getTime() - MINUTE))
    expect(dueItems(db, now).map((i) => i.hanzi)).toEqual(['三', '二'])
    expect(nextDueAt(db, now)).toBe(later.getTime())
    expect(nextDueAt(db, later)).toBeNull()
  })
})

describe('applyGrade', () => {
  it('updates the card and writes a review with the FSRS log', () => {
    addItem(db, { hanzi: '猫' }, now)
    const { card, intervalMs } = applyGrade(db, getItem(db, 1)!, 3, now)
    expect(intervalMs).toBeGreaterThan(0)
    const item = getItem(db, 1)!
    expect(item.reps).toBe(1)
    expect(item.due).toBe(card.due)
    expect(item.last_review).toBe(now.getTime())
    const review = db.prepare('SELECT * FROM reviews').get() as Record<string, unknown>
    expect(review.item_id).toBe(1)
    expect(review.rating).toBe(3)
    expect(review.ts).toBe(now.getTime())
    for (const column of [
      'state',
      'due',
      'stability',
      'difficulty',
      'elapsed_days',
      'last_elapsed_days',
      'scheduled_days',
      'learning_steps'
    ]) {
      expect(review[column], column).not.toBeNull()
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM mistakes').get()).toEqual({ n: 0 })
  })
})

describe('stats', () => {
  it('counts words, due cards, reviews and mistakes', () => {
    addItem(db, { hanzi: '一' }, now)
    addItem(db, { hanzi: '二' }, new Date(now.getTime() + MINUTE))
    applyGrade(db, getItem(db, 1)!, 4, now)
    db.prepare("INSERT INTO mistakes (item_id, ts, source) VALUES (1, ?, 'flashcard')").run(
      now.getTime()
    )
    expect(stats(db, now)).toEqual({ words: 2, due: 0, reviews: 1, mistakes: 1 })
  })
})

describe('addStudyWords', () => {
  it('trims, skips blanks and duplicates, tags as chat, returns what was added', () => {
    addItem(db, { hanzi: '猫' }, now)
    const added = addStudyWords(
      db,
      [
        { hanzi: ' 狗 ', pinyin: ' gǒu ', gloss: 'dog', example: '我有一只狗。' },
        { hanzi: '   ', pinyin: '', gloss: '', example: '' },
        { hanzi: '猫', pinyin: 'māo', gloss: 'cat', example: '' },
        { hanzi: '鸟', pinyin: 'niǎo', gloss: 'bird', example: '' }
      ],
      'chat',
      now
    )
    expect(added).toEqual(['狗', '鸟'])
    const dog = findByHanzi(db, '狗')!
    expect(dog.pinyin).toBe('gǒu')
    expect(dog.tags).toBe('chat')
    expect(countItems(db)).toBe(3)
  })
})

describe('activeWords', () => {
  it('returns the most recently reviewed words first, limited', () => {
    for (const hanzi of ['一', '二', '三']) addItem(db, { hanzi }, now)
    applyGrade(db, getItem(db, 1)!, 3, now)
    applyGrade(db, getItem(db, 2)!, 3, new Date(now.getTime() + 2 * MINUTE))
    applyGrade(db, getItem(db, 3)!, 3, new Date(now.getTime() + MINUTE))
    expect(activeWords(db).map((w) => w.hanzi)).toEqual(['二', '三', '一'])
    expect(activeWords(db, 2).map((w) => w.hanzi)).toEqual(['二', '三'])
    expect(activeWords(db)[0]).toEqual({ hanzi: '二', pinyin: '', gloss: '' })
  })
})
