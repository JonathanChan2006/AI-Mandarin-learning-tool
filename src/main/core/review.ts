import type { Db } from './db'
import { applyGrade, findByHanzi, getItem } from './items'
import { logMistake } from './mistakes'
import { AppError } from '@shared/errors'
import type { Grade } from '@shared/types'

export interface GradeResult {
  due: number
  intervalMs: number
  loggedMistake: boolean
}

/** Grade a flashcard. A rating of 1 (Again) also logs a mistake. */
export function gradeItem(
  db: Db,
  itemId: number,
  grade: Grade,
  now: Date = new Date()
): GradeResult {
  return db.transaction((): GradeResult => {
    const item = getItem(db, itemId)
    if (!item) throw new AppError('NOT_FOUND', `No card with id ${itemId}`)
    const { card, intervalMs } = applyGrade(db, item, grade, now)
    let loggedMistake = false
    if (grade === 1) {
      logMistake(
        db,
        {
          item_id: item.id,
          source: 'flashcard',
          error_type: 'recall',
          expected: `${item.hanzi} (${item.pinyin}) = ${item.gloss}`,
          note: 'failed flashcard recall'
        },
        now
      )
      loggedMistake = true
    }
    return { due: card.due, intervalMs, loggedMistake }
  })()
}

export interface ConversationError {
  error_type: string
  span: string
  correction: string
  hanzi: string
  explanation: string
}

/**
 * Log a slip made in conversation. If it matches a known word, that card is
 * graded Again so it comes back sooner. Returns whether it matched a word.
 */
export function registerConversationError(
  db: Db,
  error: ConversationError,
  now: Date = new Date()
): boolean {
  return db.transaction((): boolean => {
    const item = findByHanzi(db, error.hanzi)
    logMistake(
      db,
      {
        item_id: item?.id ?? null,
        source: 'conversation',
        error_type: error.error_type,
        user_said: error.span,
        expected: error.correction,
        context: error.hanzi,
        note: error.explanation
      },
      now
    )
    if (item) applyGrade(db, item, 1, now)
    return item !== undefined
  })()
}
