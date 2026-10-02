import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { AnalysisErrorSchema } from '@shared/contract'
import { AppError } from '@shared/errors'
import type { ActiveWord, Level } from '@shared/types'

/**
 * The two Claude passes per chat turn:
 *   reply()   - the tutor's natural response, streamed.
 *   analyze() - grades the student's message and pulls out new vocabulary.
 * Splitting them keeps the chat fluent while a second call does the grading.
 * Prompt text is carried over verbatim from the original Python tutor.
 */

export const MODEL = 'claude-opus-5'

// ---- Pass A: the tutor persona ----

export const TUTOR_BASE = `You are 老师 (Lǎoshī), a patient Mandarin conversation partner.
Keep replies short (2-4 sentences) and end with a question so the conversation
keeps going. Be encouraging. Do NOT correct the student's mistakes yourself; a
separate system handles that. Model good, natural Chinese.
`

export const LEVEL_PROMPTS: Record<Level, string> = {
  easy: `Level: beginner (HSK 1-2). Speak mostly in English with simple
Chinese mixed in. Every time you write Chinese, give pinyin and an English gloss
in parentheses, e.g. 你好 (nǐ hǎo, hello).`,
  medium: `Level: intermediate (around HSK 3-4). Speak mostly in Chinese
using fairly simple sentences. Only use English for a short clarification when the
student is clearly stuck. Give pinyin only for words that are new or likely
unfamiliar, not for every word. Do not translate whole sentences.`,
  hard: `Level: advanced. Speak only in Chinese at a natural but not
overwhelming pace. Do not give pinyin or English translations unless the student
explicitly asks. Introduce new words in context and let the student infer meaning.`
}

export const WEAK_TEMPLATE = `
The student has been struggling with these words. Naturally steer the conversation so they get chances to use them again (do not announce that you are doing this):
{items}
`

export const ACTIVE_TEMPLATE = `
The student is currently learning these words from their flashcards. Weave them into the conversation naturally where they fit; don't force all of them, just reach for these instead of other vocabulary when you have the choice:
{items}
`

/** Hidden opening turn so the tutor speaks first. Never graded. */
export const GREETING_PROMPT =
  '(The student just joined. Greet them warmly in your style and start a simple conversation.)'

export function describeWord(word: ActiveWord): string {
  return `${word.hanzi} (${word.pinyin}, ${word.gloss})`
}

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

/**
 * The tutor's system prompt: a difficulty level plus the student's own
 * vocabulary (words they get wrong, and words they're currently drilling).
 */
export function buildTutorSystem(
  weakWords: readonly string[],
  activeWords: readonly string[] = [],
  level: Level = 'medium'
): string {
  let system = TUTOR_BASE + '\n' + (LEVEL_PROMPTS[level] ?? LEVEL_PROMPTS.medium) + '\n'
  if (weakWords.length > 0) system += WEAK_TEMPLATE.replace('{items}', bulletList(weakWords))
  if (activeWords.length > 0) system += ACTIVE_TEMPLATE.replace('{items}', bulletList(activeWords))
  return system
}

// ---- Pass B: the error analyzer ----

export const ANALYZER_SYSTEM =
  "You are a meticulous Mandarin analyzer for a beginner (HSK 1-2). You are given the tutor's last reply and the student's message. Do two things:\n\n" +
  "1. errors: identify concrete mistakes in the STUDENT's CHINESE only (ignore English). Give the corrected form in hanzi so it can be linked to their flashcards. Be strict but only flag genuine errors, not stylistic choices. Empty list if none.\n\n" +
  '2. study_words: pick out useful single vocabulary words worth adding as flashcards from THIS exchange: words the student got wrong, and notable NEW words the tutor introduced that a beginner should learn. Give each as a single word (not a phrase), with tone-marked pinyin, a short English gloss, and a simple HSK 1-2 example sentence in hanzi that uses the word (you may reuse how it was used in this conversation). Skip trivial function words (我, 你, 是, 的, 吗). Empty list if nothing new is worth learning.'

export const AnalysisSchema = z.object({
  errors: z.array(
    z.object({
      error_type: AnalysisErrorSchema.shape.error_type,
      span: z.string().describe('the exact text the student wrote that is wrong'),
      correction: z.string().describe('the corrected phrase (hanzi + pinyin)'),
      hanzi: z
        .string()
        .describe(
          'the single corrected word/pattern in hanzi, for flashcard linking (may be empty)'
        ),
      explanation: z.string().describe('one short sentence, learner-friendly')
    })
  ),
  study_words: z
    .array(
      z.object({
        hanzi: z.string().describe('the word in hanzi (a single word, not a phrase)'),
        pinyin: z.string().describe('tone-marked pinyin'),
        gloss: z.string().describe('short English meaning'),
        example: z.string().describe('a simple HSK 1-2 example sentence in hanzi using the word')
      })
    )
    .describe('new/notable vocabulary from this exchange, for auto-adding as flashcards'),
  encouragement: z.string().describe('one short encouraging line in English about their Chinese')
})

export type Analysis = z.infer<typeof AnalysisSchema>

export const EMPTY_ANALYSIS: Analysis = { errors: [], study_words: [], encouragement: '' }

export type ChatMessageParam = Anthropic.Beta.BetaMessageParam

/** Holds the two API passes. The client is injected so tests can fake it. */
export class Tutor {
  constructor(private readonly client: Anthropic) {}

  /** The tutor's chat response, streamed token by token to `onToken`. */
  async reply(
    system: string,
    history: ChatMessageParam[],
    onToken?: (text: string) => void
  ): Promise<string> {
    const stream = this.client.beta.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: history,
      output_config: { effort: 'low' },
      // If a safety classifier declines, the API re-runs the turn on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    })
    if (onToken) stream.on('text', (delta) => onToken(delta))
    const message = await stream.finalMessage()
    if (message.stop_reason === 'refusal') {
      throw new AppError('REFUSED', 'The tutor declined to answer that message. Try rephrasing it.')
    }
    return message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }

  /** Grade one message and extract new vocabulary. Empty analysis when parsing fails. */
  async analyze(userMessage: string, tutorReply = ''): Promise<Analysis> {
    const content = tutorReply
      ? `Tutor said: ${tutorReply}\n\nStudent said: ${userMessage}`
      : `Student said: ${userMessage}`
    const message = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      system: ANALYZER_SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(AnalysisSchema) }
    })
    return message.parsed_output ?? EMPTY_ANALYSIS
  }
}
