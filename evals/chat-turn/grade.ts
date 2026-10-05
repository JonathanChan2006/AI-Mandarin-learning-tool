/**
 * Scoring for the chat-turn eval. Pure functions, no API calls, so the rules
 * can be unit-tested and read without running anything.
 */

export interface Expected {
  /** The mistake counts as caught if a correction (or its hanzi) contains any of these. */
  fix_any: string[]
  /** ...unless the correction still contains one of these (for "delete a word" fixes). */
  fix_none?: string[]
  /** The flashcard the correction should link to, when that is unambiguous. */
  card?: string
  why?: string
}

export interface FlaggedError {
  error_type: string
  span: string
  correction: string
  hanzi: string
  explanation: string
  linked?: boolean
}

export interface GradeInput {
  /** Absent for sentences that are correct and must not be flagged. */
  expected?: Expected
  errors: FlaggedError[]
  reply: string
  /** The design produced no analysis at all (grader call failed, tool not called). */
  analysisFailed: boolean
}

export interface AnalysisGrade {
  /** Mistake caught, or correct sentence left alone. Always 0 when there was no analysis. */
  graded_right: number
  /** Nothing was flagged beyond the planted mistake. Omitted when there was no analysis. */
  no_false_flag?: number
  /** The matching correction names the expected flashcard. Only for cases that expect one. */
  links_card?: number
  /** The tutor's reply ends with a question, as its brief asks. */
  ends_question: number
}

const squash = (text: string): string => text.replace(/\s+/g, '')

export function matchesExpected(error: FlaggedError, expected: Expected): boolean {
  const correction = squash(error.correction)
  if (expected.fix_none?.some((bad) => correction.includes(squash(bad)))) return false
  const haystack = `${correction}\u0000${squash(error.hanzi)}`
  return expected.fix_any.some((fix) => haystack.includes(squash(fix)))
}

/** A question mark at the end, allowing trailing quotes, brackets, spaces or emoji. */
export function endsWithQuestion(reply: string): boolean {
  return /[？?][\s"'”’）)」』\p{Extended_Pictographic}️]*$/u.test(reply)
}

/** Sentences as a reader would count them: runs of text closed by 。！？!?… or a full stop. */
export function countSentences(reply: string): number {
  return reply
    .split(/[。！？!?…]+|\.(?=\s|$)/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length
}

export function gradeAnalysis({
  expected,
  errors,
  reply,
  analysisFailed
}: GradeInput): AnalysisGrade {
  const ends_question = endsWithQuestion(reply) ? 1 : 0
  // No analysis is not the same as "found nothing": it never counts as right.
  if (analysisFailed) {
    return { graded_right: 0, ends_question, ...(expected?.card ? { links_card: 0 } : {}) }
  }
  if (!expected) {
    const clean = errors.length === 0 ? 1 : 0
    return { graded_right: clean, no_false_flag: clean, ends_question }
  }
  const hits = errors.filter((error) => matchesExpected(error, expected))
  const grade: AnalysisGrade = {
    graded_right: hits.length > 0 ? 1 : 0,
    no_false_flag: hits.length === errors.length ? 1 : 0,
    ends_question
  }
  if (expected.card) {
    const card = squash(expected.card)
    grade.links_card = hits.some((error) => squash(error.hanzi) === card) ? 1 : 0
  }
  return grade
}
