import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import fixtures from './__fixtures__/tutor-prompts.json'
import {
  AnalysisSchema,
  ANALYZER_SYSTEM,
  buildTutorSystem,
  describeWord,
  EMPTY_ANALYSIS,
  Tutor
} from './tutor'
import { AppError } from '@shared/errors'
import type { Level } from '@shared/types'

describe('prompts match the Python tutor byte for byte', () => {
  it.each(fixtures.cases.map((c) => [c.level, c.case, c] as const))(
    '%s / %s',
    (_level, _name, c) => {
      expect(buildTutorSystem(c.weak, c.active, c.level as Level)).toBe(c.system)
    }
  )

  it('analyzer system prompt', () => {
    expect(ANALYZER_SYSTEM).toBe(fixtures.analyzer_system)
  })

  it('describes a word the way the prompt expects', () => {
    expect(describeWord({ hanzi: '还是', pinyin: 'háishi', gloss: 'or' })).toBe('还是 (háishi, or)')
  })
})

describe('AnalysisSchema', () => {
  it('rejects unknown error types and missing fields', () => {
    expect(
      AnalysisSchema.safeParse({
        errors: [{ error_type: 'vibes', span: '', correction: '', hanzi: '', explanation: '' }],
        study_words: [],
        encouragement: ''
      }).success
    ).toBe(false)
    expect(AnalysisSchema.safeParse({ errors: [], study_words: [] }).success).toBe(false)
    expect(AnalysisSchema.safeParse(EMPTY_ANALYSIS).success).toBe(true)
  })
})

interface FakeStreamOptions {
  tokens: string[]
  stopReason?: string
}

function fakeClient(
  options: FakeStreamOptions,
  parsed: unknown = EMPTY_ANALYSIS
): {
  client: Anthropic
  streamParams: unknown[]
  parseParams: unknown[]
} {
  const streamParams: unknown[] = []
  const parseParams: unknown[] = []
  const stream = (params: unknown): unknown => {
    streamParams.push(params)
    const listeners: ((delta: string) => void)[] = []
    return {
      on(event: string, listener: (delta: string) => void) {
        if (event === 'text') listeners.push(listener)
        return this
      },
      async finalMessage() {
        for (const token of options.tokens) for (const l of listeners) l(token)
        return {
          stop_reason: options.stopReason ?? 'end_turn',
          content: [{ type: 'text', text: options.tokens.join('') }]
        }
      }
    }
  }
  const client = {
    beta: { messages: { stream } },
    messages: {
      parse: vi.fn(async (params: unknown) => {
        parseParams.push(params)
        return { parsed_output: parsed }
      })
    }
  } as unknown as Anthropic
  return { client, streamParams, parseParams }
}

describe('Tutor.reply', () => {
  it('streams tokens in order and returns the joined text', async () => {
    const { client, streamParams } = fakeClient({ tokens: ['你', '好', '！'] })
    const seen: string[] = []
    const reply = await new Tutor(client).reply('SYS', [{ role: 'user', content: 'hi' }], (t) =>
      seen.push(t)
    )
    expect(seen).toEqual(['你', '好', '！'])
    expect(reply).toBe('你好！')
    expect(streamParams[0]).toMatchObject({
      model: 'claude-opus-5',
      system: 'SYS',
      messages: [{ role: 'user', content: 'hi' }],
      fallbacks: 'default'
    })
  })

  it('turns a refusal into a REFUSED error', async () => {
    const { client } = fakeClient({ tokens: [], stopReason: 'refusal' })
    await expect(new Tutor(client).reply('SYS', [])).rejects.toMatchObject({ code: 'REFUSED' })
    await expect(new Tutor(client).reply('SYS', [])).rejects.toBeInstanceOf(AppError)
  })
})

describe('Tutor.analyze', () => {
  it('sends both sides of the exchange and returns the parsed analysis', async () => {
    const analysis = {
      errors: [
        {
          error_type: 'tone',
          span: 'ma',
          correction: '妈 (mā)',
          hanzi: '妈',
          explanation: 'First tone.'
        }
      ],
      study_words: [{ hanzi: '妈', pinyin: 'mā', gloss: 'mum', example: '我妈很好。' }],
      encouragement: 'Nice try!'
    }
    const { client, parseParams } = fakeClient({ tokens: [] }, analysis)
    const result = await new Tutor(client).analyze('我ma很好', '你好！')
    expect(result).toEqual(analysis)
    expect(parseParams[0]).toMatchObject({
      system: ANALYZER_SYSTEM,
      messages: [{ role: 'user', content: 'Tutor said: 你好！\n\nStudent said: 我ma很好' }]
    })
  })

  it('falls back to an empty analysis when nothing parsed', async () => {
    const { client } = fakeClient({ tokens: [] }, null)
    expect(await new Tutor(client).analyze('hi')).toEqual(EMPTY_ANALYSIS)
  })
})
