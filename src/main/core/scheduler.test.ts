import { describe, expect, it } from 'vitest'
import {
  formatInterval,
  fromCard,
  gradeCard,
  newCardState,
  previewIntervals,
  toCard
} from './scheduler'

const now = new Date('2026-09-28T12:00:00Z')
const MINUTE = 60_000
const DAY = 86_400_000

describe('newCardState', () => {
  it('is a New card due immediately', () => {
    const card = newCardState(now)
    expect(card.state).toBe(0)
    expect(card.due).toBe(now.getTime())
    expect(card.reps).toBe(0)
    expect(card.lapses).toBe(0)
    expect(card.last_review).toBeNull()
  })
})

describe('gradeCard on a new card', () => {
  it('Good enters Learning and comes back in about ten minutes', () => {
    const { card, log } = gradeCard(newCardState(now), 3, now)
    expect(card.state).toBe(1)
    expect(card.due - now.getTime()).toBeGreaterThanOrEqual(5 * MINUTE)
    expect(card.due - now.getTime()).toBeLessThanOrEqual(15 * MINUTE)
    expect(card.reps).toBe(1)
    expect(card.last_review).toBe(now.getTime())
    expect(log.rating).toBe(3)
    expect(log.state).toBe(0)
  })

  it('Again comes back within two minutes', () => {
    const { card } = gradeCard(newCardState(now), 1, now)
    expect(card.state).toBe(1)
    expect(card.due - now.getTime()).toBeLessThanOrEqual(2 * MINUTE)
  })

  it('Easy graduates straight to Review at least a day out', () => {
    const { card } = gradeCard(newCardState(now), 4, now)
    expect(card.state).toBe(2)
    expect(card.due - now.getTime()).toBeGreaterThanOrEqual(DAY)
  })

  it('Again on a Review card counts a lapse', () => {
    const graduated = gradeCard(newCardState(now), 4, now).card
    const later = new Date(graduated.due + DAY)
    const { card } = gradeCard(graduated, 1, later)
    expect(card.lapses).toBe(1)
    expect(card.state).toBe(3)
  })
})

describe('previewIntervals', () => {
  it('grows with the grade and matches what grading would do', () => {
    const state = newCardState(now)
    const intervals = previewIntervals(state, now)
    expect(intervals[1]).toBeLessThan(intervals[2])
    expect(intervals[2]).toBeLessThan(intervals[3])
    expect(intervals[3]).toBeLessThan(intervals[4])
    for (const grade of [1, 2, 3, 4] as const) {
      expect(gradeCard(state, grade, now).card.due - now.getTime()).toBe(intervals[grade])
    }
  })

  it('is deterministic (fuzz is off)', () => {
    const state = gradeCard(newCardState(now), 4, now).card
    const later = new Date(state.due + 3 * DAY)
    expect(previewIntervals(state, later)).toEqual(previewIntervals(state, later))
  })
})

describe('card conversion', () => {
  it('round-trips every field including a null last_review', () => {
    const fresh = newCardState(now)
    expect(fromCard(toCard(fresh))).toEqual(fresh)
    const reviewed = gradeCard(fresh, 3, now).card
    expect(fromCard(toCard(reviewed))).toEqual(reviewed)
  })
})

describe('formatInterval', () => {
  it.each([
    [0, '<1m'],
    [59_000, '<1m'],
    [60_000, '1m'],
    [5 * MINUTE, '5m'],
    [10 * MINUTE, '10m'],
    [3_599_000, '1h'],
    [3_600_000, '1h'],
    [5 * 3_600_000, '5h'],
    [86_399_000, '1d'],
    [DAY, '1d'],
    [15 * DAY, '15d']
  ])('%i ms -> %s', (ms, label) => {
    expect(formatInterval(ms)).toBe(label)
  })
})
