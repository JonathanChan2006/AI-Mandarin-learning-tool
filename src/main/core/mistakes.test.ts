import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from './db'
import { addItem, applyGrade, getItem } from './items'
import { decay, listMistakes, logMistake, weakItems } from './mistakes'

const now = new Date('2026-09-28T12:00:00Z')
const DAY = 86_400_000

let db: Db
beforeEach(() => {
  db = openDatabase(':memory:')
  for (const hanzi of ['一', '二', '三']) addItem(db, { hanzi }, new Date(now.getTime() - 60 * DAY))
})

describe('decay', () => {
  it('is 1 now, 0.5 after one half-life, 0.25 after two', () => {
    expect(decay(now.getTime(), now.getTime())).toBe(1)
    expect(decay(now.getTime() - 30 * DAY, now.getTime())).toBeCloseTo(0.5)
    expect(decay(now.getTime() - 60 * DAY, now.getTime())).toBeCloseTo(0.25)
  })
})

describe('listMistakes', () => {
  it('returns newest first with limit and offset', () => {
    logMistake(db, { item_id: 1, source: 'flashcard' }, new Date(now.getTime() - DAY))
    logMistake(
      db,
      { item_id: null, source: 'conversation', error_type: 'tone', user_said: 'ma' },
      now
    )
    const all = listMistakes(db)
    expect(all.map((m) => m.error_type)).toEqual(['tone', 'recall'])
    expect(all[0].item_id).toBeNull()
    expect(all[0].user_said).toBe('ma')
    expect(listMistakes(db, 1, 1).map((m) => m.error_type)).toEqual(['recall'])
  })
})

describe('weakItems', () => {
  it('scores a fresh mistake as 1.0 and a 30-day-old one as 0.5', () => {
    logMistake(db, { item_id: 1, source: 'flashcard' }, now)
    logMistake(db, { item_id: 2, source: 'flashcard' }, new Date(now.getTime() - 30 * DAY))
    const weak = weakItems(db, now)
    expect(weak.map((w) => [w.hanzi, w.score])).toEqual([
      ['一', 1],
      ['二', 0.5]
    ])
  })

  it('is redeemed by a later Good review but not by Hard', () => {
    logMistake(db, { item_id: 1, source: 'flashcard' }, now)
    applyGrade(db, getItem(db, 1)!, 3, now)
    logMistake(db, { item_id: 2, source: 'flashcard' }, now)
    applyGrade(db, getItem(db, 2)!, 2, now)
    expect(weakItems(db, now).map((w) => w.hanzi)).toEqual(['二'])
  })

  it('ignores mistakes that are not linked to a card', () => {
    logMistake(db, { item_id: null, source: 'conversation' }, now)
    expect(weakItems(db, now)).toEqual([])
  })

  it('sorts by score, applies the limit and rounds to two decimals', () => {
    logMistake(db, { item_id: 1, source: 'flashcard' }, new Date(now.getTime() - 10 * DAY))
    logMistake(db, { item_id: 2, source: 'flashcard' }, now)
    logMistake(db, { item_id: 2, source: 'flashcard' }, now)
    logMistake(db, { item_id: 3, source: 'flashcard' }, new Date(now.getTime() - 20 * DAY))
    const weak = weakItems(db, now)
    expect(weak.map((w) => w.hanzi)).toEqual(['二', '一', '三'])
    expect(weak[1].score).toBe(0.79)
    expect(weak[2].score).toBe(0.63)
    expect(weakItems(db, now, 1).map((w) => w.hanzi)).toEqual(['二'])
  })

  it('drops words whose score has faded below the threshold', () => {
    logMistake(db, { item_id: 1, source: 'flashcard' }, new Date(now.getTime() - 200 * DAY))
    expect(weakItems(db, now)).toEqual([])
  })
})
