import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from './db'
import { addItem, getItem } from './items'
import { gradeItem, registerConversationError } from './review'
import { AppError } from '@shared/errors'

const now = new Date('2026-09-28T12:00:00Z')

let db: Db
beforeEach(() => {
  db = openDatabase(':memory:')
  addItem(db, { hanzi: '猫', pinyin: 'māo', gloss: 'cat' }, now)
})

describe('gradeItem', () => {
  it('Good reschedules and records a review without a mistake', () => {
    const result = gradeItem(db, 1, 3, now)
    expect(result.loggedMistake).toBe(false)
    expect(result.due).toBe(getItem(db, 1)!.due)
    expect(result.intervalMs).toBe(result.due - now.getTime())
    expect(db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM mistakes').get()).toEqual({ n: 0 })
  })

  it('Again also logs a flashcard mistake with the expected form', () => {
    const result = gradeItem(db, 1, 1, now)
    expect(result.loggedMistake).toBe(true)
    const mistake = db.prepare('SELECT * FROM mistakes').get() as Record<string, unknown>
    expect(mistake).toMatchObject({
      item_id: 1,
      ts: now.getTime(),
      source: 'flashcard',
      error_type: 'recall',
      user_said: '',
      expected: '猫 (māo) = cat',
      context: '',
      note: 'failed flashcard recall'
    })
  })

  it('rejects an unknown card', () => {
    expect(() => gradeItem(db, 99, 3, now)).toThrowError(AppError)
    expect(() => gradeItem(db, 99, 3, now)).toThrowError(/99/)
  })
})

describe('registerConversationError', () => {
  const slip = {
    error_type: 'tone',
    span: '我有一只猫',
    correction: '我有一只猫 (wǒ yǒu yī zhī māo)',
    hanzi: '猫',
    explanation: 'The measure word for cats is 只.'
  }

  it('links to a known word, logs the mistake and grades that card Again', () => {
    expect(registerConversationError(db, slip, now)).toBe(true)
    const mistake = db.prepare('SELECT * FROM mistakes').get() as Record<string, unknown>
    expect(mistake).toMatchObject({
      item_id: 1,
      source: 'conversation',
      error_type: 'tone',
      user_said: slip.span,
      expected: slip.correction,
      context: '猫',
      note: slip.explanation
    })
    const review = db.prepare('SELECT rating FROM reviews').get() as { rating: number }
    expect(review.rating).toBe(1)
    expect(getItem(db, 1)!.reps).toBe(1)
  })

  it('logs an unlinked mistake when the word is unknown or empty', () => {
    expect(registerConversationError(db, { ...slip, hanzi: '狗' }, now)).toBe(false)
    expect(registerConversationError(db, { ...slip, hanzi: '' }, now)).toBe(false)
    const rows = db.prepare('SELECT item_id FROM mistakes').all() as { item_id: number | null }[]
    expect(rows).toEqual([{ item_id: null }, { item_id: null }])
    expect(db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 0 })
  })
})
