import { describe, expect, it } from 'vitest'
import { openDatabase } from './db'
import { addItem, applyGrade, getItem } from './items'
import { logMistake } from './mistakes'
import { knownWords } from './vocab'

const now = new Date('2026-09-28T12:00:00Z')
const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000)

describe('knownWords', () => {
  it('returns Review-state words that are not currently weak', () => {
    const db = openDatabase(':memory:')
    for (const hanzi of ['猫', '狗', '鸟', '鱼']) addItem(db, { hanzi }, sixtyDaysAgo)
    applyGrade(db, getItem(db, 1)!, 4, now) // Easy: straight to Review
    applyGrade(db, getItem(db, 2)!, 3, now) // Good: still Learning
    applyGrade(db, getItem(db, 3)!, 4, sixtyDaysAgo) // learned long ago...
    logMistake(db, { item_id: 3, source: 'conversation' }, now) // ...slipped today, so weak again
    expect(knownWords(db, now)).toEqual(['猫'])
  })
})
