import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type Grade as FsrsGrade,
  type ReviewLog,
  type State
} from 'ts-fsrs'
import type { CardState, Grade, ReviewLogState } from '@shared/types'

/**
 * FSRS parameters are pinned explicitly so a ts-fsrs default change cannot
 * silently alter scheduling. Steps mirror the old py-fsrs behaviour
 * (Again 1 minute, Good 10 minutes on a new card).
 */
export const FSRS_PARAMETERS = generatorParameters({
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m']
})

const scheduler = fsrs(FSRS_PARAMETERS)

const RATING_OF: Record<Grade, FsrsGrade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy
}

export function toCard(state: CardState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    last_review: state.last_review === null ? undefined : new Date(state.last_review)
  }
}

export function fromCard(card: Card): CardState {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null
  }
}

function fromLog(log: ReviewLog): ReviewLogState {
  return {
    rating: log.rating as Grade,
    state: log.state,
    due: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps
  }
}

/** A fresh card, due immediately. */
export function newCardState(now: Date = new Date()): CardState {
  return fromCard(createEmptyCard(now))
}

/** Apply one grade and return the new state plus what FSRS logged for it. */
export function gradeCard(
  state: CardState,
  grade: Grade,
  now: Date = new Date()
): { card: CardState; log: ReviewLogState } {
  const result = scheduler.next(toCard(state), now, RATING_OF[grade])
  return { card: fromCard(result.card), log: fromLog(result.log) }
}

/** Milliseconds until the card would next be due, for each grade. */
export function previewIntervals(state: CardState, now: Date = new Date()): Record<Grade, number> {
  const preview = scheduler.repeat(toCard(state), now)
  const intervalFor = (grade: Grade): number =>
    preview[RATING_OF[grade]].card.due.getTime() - now.getTime()
  return { 1: intervalFor(1), 2: intervalFor(2), 3: intervalFor(3), 4: intervalFor(4) }
}

export { formatInterval } from '@shared/format'
