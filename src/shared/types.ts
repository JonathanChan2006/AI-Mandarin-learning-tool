/**
 * Domain types shared by the main process and the renderer.
 * Every timestamp is epoch milliseconds (UTC).
 */

export type Grade = 1 | 2 | 3 | 4
export const GRADES: readonly Grade[] = [1, 2, 3, 4]
export const GRADE_LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

export type Level = 'easy' | 'medium' | 'hard'
export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: Level = 'medium'

export type MistakeSource = 'flashcard' | 'conversation'

/** FSRS card state, stored as flat columns on `items` (mirrors ts-fsrs `Card`). */
export interface CardState {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  /** 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: number
  last_review: number | null
}

export interface Item extends CardState {
  id: number
  type: string
  hanzi: string
  pinyin: string
  gloss: string
  example: string
  tags: string
  /** Unmapped fields from an import (audio refs, part of speech, ...). */
  extra: Record<string, unknown>
  created_at: number
}

/** What ts-fsrs records for one review; stored on `reviews` next to the rating. */
export interface ReviewLogState {
  rating: Grade
  state: number
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
}

export interface Mistake {
  id: number
  item_id: number | null
  ts: number
  source: MistakeSource
  error_type: string
  user_said: string
  expected: string
  context: string
  note: string
}

export interface Stats {
  words: number
  due: number
  reviews: number
  mistakes: number
}

export interface WeakItem extends Item {
  score: number
}

export interface ActiveWord {
  hanzi: string
  pinyin: string
  gloss: string
}

export interface StudyWord {
  hanzi: string
  pinyin: string
  gloss: string
  example: string
}
