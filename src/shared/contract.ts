import { z } from 'zod'
import type { Channel } from './channels'
import type { ErrorCode } from './errors'
import type { Item, Mistake, Stats, WeakItem } from './types'

export { CHANNELS, CHAT_TOKEN_EVENT, type Channel } from './channels'

// ---- building blocks -------------------------------------------------------

export const GradeSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export const LevelSchema = z.enum(['easy', 'medium', 'hard'])

const CardStateSchema = z.object({
  due: z.number(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  last_review: z.number().nullable()
})

export const ItemSchema = CardStateSchema.extend({
  id: z.number(),
  type: z.string(),
  hanzi: z.string(),
  pinyin: z.string(),
  gloss: z.string(),
  example: z.string(),
  tags: z.string(),
  extra: z.record(z.string(), z.unknown()),
  created_at: z.number()
}) satisfies z.ZodType<Item>

export const WeakItemSchema = ItemSchema.extend({ score: z.number() }) satisfies z.ZodType<WeakItem>

export const MistakeSchema = z.object({
  id: z.number(),
  item_id: z.number().nullable(),
  ts: z.number(),
  source: z.enum(['flashcard', 'conversation']),
  error_type: z.string(),
  user_said: z.string(),
  expected: z.string(),
  context: z.string(),
  note: z.string()
}) satisfies z.ZodType<Mistake>

export const StatsSchema = z.object({
  words: z.number(),
  due: z.number(),
  reviews: z.number(),
  mistakes: z.number()
}) satisfies z.ZodType<Stats>

/** Milliseconds until the card is next due, per grade. */
export const IntervalsSchema = z.object({
  1: z.number(),
  2: z.number(),
  3: z.number(),
  4: z.number()
})

export const AnalysisErrorSchema = z.object({
  error_type: z.enum([
    'tone',
    'wrong_word',
    'word_order',
    'missing_particle',
    'measure_word',
    'grammar',
    'spelling',
    'other'
  ]),
  span: z.string(),
  correction: z.string(),
  hanzi: z.string(),
  explanation: z.string()
})

export const StudyWordSchema = z.object({
  hanzi: z.string(),
  pinyin: z.string(),
  gloss: z.string(),
  example: z.string()
})

export const TurnResultSchema = z.object({
  turnId: z.string(),
  reply: z.string(),
  errors: z.array(AnalysisErrorSchema.extend({ linked: z.boolean() })),
  added: z.array(z.string()),
  encouragement: z.string(),
  analysisFailed: z.boolean()
})

/** Which imported field feeds each card column (0-based index into `fields`). */
export const MappingSchema = z.object({
  hanzi: z.number().int().nonnegative(),
  pinyin: z.number().int().nonnegative().nullable(),
  gloss: z.number().int().nonnegative().nullable(),
  example: z.number().int().nonnegative().nullable()
})

export const ApkgSummarySchema = z.object({
  path: z.string(),
  fileName: z.string(),
  noteCount: z.number(),
  skipped: z.number(),
  fields: z.array(z.string()),
  samples: z.array(z.array(z.string())),
  guessedMapping: MappingSchema.nullable()
})

export const PreviewRowSchema = z.object({
  hanzi: z.string(),
  pinyin: z.string(),
  gloss: z.string(),
  example: z.string()
})

export const SettingsSchema = z.object({
  hasKey: z.boolean(),
  source: z.enum(['env', 'stored']).nullable(),
  encryptionAvailable: z.boolean(),
  legacyKeyFile: z.boolean(),
  dbPath: z.string()
})

// ---- the contract ----------------------------------------------------------

export const contract = {
  'stats:get': { input: z.void(), output: StatsSchema },
  'review:queue': {
    input: z.void(),
    output: z.object({
      items: z.array(ItemSchema.extend({ intervals: IntervalsSchema })),
      nextDueAt: z.number().nullable()
    })
  },
  'review:grade': {
    input: z.object({ itemId: z.number().int().positive(), rating: GradeSchema }),
    output: z.object({ due: z.number(), intervalMs: z.number(), loggedMistake: z.boolean() })
  },
  'weak:list': {
    input: z.object({ limit: z.number().int().positive().max(500).default(50) }),
    output: z.array(WeakItemSchema)
  },
  'mistakes:list': {
    input: z.object({
      limit: z.number().int().positive().max(1000).default(100),
      offset: z.number().int().nonnegative().default(0)
    }),
    output: z.array(MistakeSchema)
  },
  'items:add': {
    input: z.object({
      hanzi: z.string().trim().min(1),
      pinyin: z.string().trim().default(''),
      gloss: z.string().trim().default(''),
      example: z.string().trim().default(''),
      type: z.string().trim().min(1).default('vocab'),
      tags: z.string().trim().default('')
    }),
    output: z.object({ id: z.number().nullable() })
  },
  'seed:load': { input: z.void(), output: z.object({ added: z.number(), total: z.number() }) },
  /** Hanzi the learner already knows; the chat hides their pinyin. */
  'vocab:known': { input: z.void(), output: z.array(z.string()) },
  'chat:start': {
    input: z.object({ level: LevelSchema }),
    output: z.object({ sessionId: z.string(), greeting: z.string() })
  },
  'chat:send': {
    input: z.object({ sessionId: z.string().min(1), text: z.string().trim().min(1).max(4000) }),
    output: TurnResultSchema
  },
  'import:pick': { input: z.void(), output: ApkgSummarySchema.nullable() },
  'import:preview': {
    input: z.object({ path: z.string().min(1), mapping: MappingSchema }),
    output: z.array(PreviewRowSchema)
  },
  'import:commit': {
    input: z.object({
      path: z.string().min(1),
      mapping: MappingSchema,
      tags: z.string().trim().default('anki')
    }),
    output: z.object({
      added: z.number(),
      dupes: z.number(),
      empty: z.number(),
      total: z.number()
    })
  },
  'settings:get': { input: z.void(), output: SettingsSchema },
  'settings:setKey': { input: z.object({ key: z.string().trim().min(10) }), output: z.void() },
  'settings:clearKey': { input: z.void(), output: z.void() },
  'settings:importLegacyKey': {
    input: z.object({ deleteFile: z.boolean().default(false) }),
    output: z.void()
  },
  /** Opens a file dialog for the Python app's database; null when the dialog is cancelled. */
  'legacy:import': {
    input: z.object({ replace: z.boolean().default(false) }),
    output: z
      .object({
        items: z.number(),
        reviews: z.number(),
        mistakes: z.number(),
        backup: z.string().nullable()
      })
      .nullable()
  },
  /** Whether the operating system has a Chinese input method turned on. */
  'typing:status': {
    input: z.void(),
    output: z.object({
      status: z.enum(['enabled', 'missing', 'unknown']),
      platform: z.enum(['mac', 'windows', 'other'])
    })
  },
  /** Opens the system page where a Chinese keyboard is added. */
  'typing:openSettings': { input: z.void(), output: z.void() }
} as const satisfies Record<Channel, { input: z.ZodType; output: z.ZodType }>

export type Contract = typeof contract

/** What the renderer passes (defaults still optional). */
export type Input<K extends Channel> = z.input<Contract[K]['input']>
/** What a handler receives (defaults applied). */
export type Parsed<K extends Channel> = z.output<Contract[K]['input']>
export type Output<K extends Channel> = z.output<Contract[K]['output']>

export type Grade = z.infer<typeof GradeSchema>
export type Level = z.infer<typeof LevelSchema>
export type Mapping = z.infer<typeof MappingSchema>
export type ApkgSummary = z.infer<typeof ApkgSummarySchema>
export type PreviewRow = z.infer<typeof PreviewRowSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type TypingInfo = z.infer<(typeof contract)['typing:status']['output']>
export type TurnResult = z.infer<typeof TurnResultSchema>
export type AnalysisError = z.infer<typeof AnalysisErrorSchema>
export type ReviewQueue = Output<'review:queue'>
export type QueueItem = ReviewQueue['items'][number]

export interface ApiErrorShape {
  code: ErrorCode
  message: string
}

/**
 * Every invoke resolves to this envelope: a rejected `ipcMain.handle` promise
 * reaches the renderer as a bare Error with only its message, so codes travel
 * inside the value instead.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiErrorShape }

export interface ChatToken {
  sessionId: string
  turnId: string
  text: string
}

/** Arguments for a channel: none when its input is `void`. */
export type Args<K extends Channel> = Input<K> extends void ? [] : [input: Input<K>]

/** What the preload exposes on `window.api`. */
export type RawApi = {
  [K in Channel]: (...args: Args<K>) => Promise<Result<Output<K>>>
} & {
  onChatToken(listener: (token: ChatToken) => void): () => void
}
