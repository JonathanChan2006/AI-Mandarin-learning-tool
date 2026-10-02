import type { Db } from './db'
import { addItem, countItems } from './items'
import seedWords from './seed_hsk1.json'
import type { StudyWord } from '@shared/types'

/** Forty HSK 1 starter words, so a fresh install has something to review. */
export const SEED_WORDS: readonly StudyWord[] = seedWords

export function loadSeed(
  db: Db,
  words: readonly StudyWord[] = SEED_WORDS,
  now: Date = new Date()
): { added: number; total: number } {
  let added = 0
  db.transaction(() => {
    for (const word of words) {
      if (addItem(db, { ...word, tags: 'hsk1' }, now) !== null) added++
    }
  })()
  return { added, total: countItems(db) }
}
