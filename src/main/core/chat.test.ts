import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatService } from './chat'
import { openDatabase, type Db } from './db'
import { addItem, findByHanzi, getItem } from './items'
import { logMistake } from './mistakes'
import {
  EMPTY_ANALYSIS,
  GREETING_PROMPT,
  type Analysis,
  type ChatMessageParam,
  type Tutor
} from './tutor'

const now = new Date('2026-09-28T12:00:00Z')

class FakeTutor {
  systems: string[] = []
  histories: ChatMessageParam[][] = []
  replies: (string | Error)[] = []
  analyses: (Analysis | Error)[] = []

  async reply(
    system: string,
    history: ChatMessageParam[],
    onToken?: (t: string) => void
  ): Promise<string> {
    this.systems.push(system)
    this.histories.push(history)
    const next = this.replies.shift() ?? '好的。'
    if (next instanceof Error) throw next
    for (const ch of next) onToken?.(ch)
    return next
  }

  analyzeArgs: [string, string][] = []
  combined: ({ reply: string; analysis: Analysis | null } | Error)[] = []

  async analyze(userMessage: string, tutorLine = ''): Promise<Analysis> {
    this.analyzeArgs.push([userMessage, tutorLine])
    const next = this.analyses.shift() ?? EMPTY_ANALYSIS
    if (next instanceof Error) throw next
    return next
  }

  async replyAndAnalyze(
    system: string,
    history: ChatMessageParam[],
    onToken?: (t: string) => void
  ): Promise<{ reply: string; analysis: Analysis | null }> {
    this.systems.push(system)
    this.histories.push(history)
    const next = this.combined.shift() ?? { reply: '好的。', analysis: EMPTY_ANALYSIS }
    if (next instanceof Error) throw next
    for (const ch of next.reply) onToken?.(ch)
    return next
  }
}

let db: Db
let tutor: FakeTutor
let chat: ChatService
beforeEach(() => {
  db = openDatabase(':memory:')
  tutor = new FakeTutor()
  chat = new ChatService(db, () => tutor as unknown as Tutor, {
    now: () => now,
    log: { warn: vi.fn() }
  })
})

describe('ChatService.start', () => {
  it('greets with a hidden opening turn and streams the greeting', async () => {
    tutor.replies = ['你好！']
    const tokens: string[] = []
    const { sessionId, greeting } = await chat.start('easy', (t) => tokens.push(t.text))
    expect(greeting).toBe('你好！')
    expect(tokens).toEqual(['你', '好', '！'])
    expect(tutor.histories[0]).toEqual([{ role: 'user', content: GREETING_PROMPT }])
    expect(chat.getSession(sessionId)?.history).toEqual([
      { role: 'user', content: GREETING_PROMPT },
      { role: 'assistant', content: '你好！' }
    ])
    expect(tutor.systems[0]).toContain('Level: beginner')
  })
})

describe('ChatService.send', () => {
  it('commits the exchange only after the tutor replied', async () => {
    tutor.replies = ['你好！', new Error('network down'), '很好！']
    const { sessionId } = await chat.start('medium')
    await expect(chat.send(sessionId, '我很好')).rejects.toThrow('network down')
    expect(chat.getSession(sessionId)?.history).toHaveLength(2)

    const turn = await chat.send(sessionId, '我很好')
    expect(turn.reply).toBe('很好！')
    expect(turn.analysisFailed).toBe(false)
    expect(chat.getSession(sessionId)?.history.slice(2)).toEqual([
      { role: 'user', content: '我很好' },
      { role: 'assistant', content: '很好！' }
    ])
  })

  it('keeps the reply when grading fails', async () => {
    tutor.replies = ['你好！', '很好！']
    tutor.analyses = [new Error('parse failed')]
    const { sessionId } = await chat.start('medium')
    const turn = await chat.send(sessionId, '我很好')
    expect(turn).toMatchObject({ reply: '很好！', analysisFailed: true, errors: [], added: [] })
  })

  it('registers errors against cards and adds study words', async () => {
    addItem(db, { hanzi: '猫', pinyin: 'māo', gloss: 'cat' }, now)
    tutor.replies = ['你好！', '好的。']
    tutor.analyses = [
      {
        errors: [
          {
            error_type: 'measure_word',
            span: '一个猫',
            correction: '一只猫',
            hanzi: '猫',
            explanation: 'Use 只.'
          },
          {
            error_type: 'tone',
            span: 'gou',
            correction: '狗 (gǒu)',
            hanzi: '狗',
            explanation: 'Third tone.'
          }
        ],
        study_words: [{ hanzi: '狗', pinyin: 'gǒu', gloss: 'dog', example: '我有一只狗。' }],
        encouragement: 'Keep going!'
      }
    ]
    const { sessionId } = await chat.start('medium')
    const turn = await chat.send(sessionId, '我有一个猫和gou')
    expect(turn.errors.map((e) => e.linked)).toEqual([true, false])
    expect(turn.added).toEqual(['狗'])
    expect(turn.encouragement).toBe('Keep going!')
    expect(getItem(db, 1)?.reps).toBe(1)
    expect(findByHanzi(db, '狗')?.tags).toBe('chat')
    expect(db.prepare('SELECT COUNT(*) AS n FROM mistakes').get()).toEqual({ n: 2 })
  })

  it('rebuilds the system prompt from the database on every turn', async () => {
    addItem(db, { hanzi: '猫', pinyin: 'māo', gloss: 'cat' }, now)
    tutor.replies = ['你好！', '好的。', '好的。']
    const { sessionId } = await chat.start('hard')
    await chat.send(sessionId, '一')
    logMistake(db, { item_id: 1, source: 'flashcard' }, now)
    await chat.send(sessionId, '二')
    expect(tutor.systems[1]).not.toContain('猫 (māo, cat)')
    expect(tutor.systems[2]).toContain('- 猫 (māo, cat)')
    expect(tutor.systems[2]).toContain('Level: advanced')
  })

  it('rejects an unknown session', async () => {
    await expect(chat.send('nope', 'hi')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('ChatService.open', () => {
  it('starts a session from a known tutor line without calling the API', async () => {
    const sessionId = chat.open('medium', '你家有宠物吗？')
    expect(tutor.histories).toHaveLength(0)
    expect(chat.getSession(sessionId)?.history).toEqual([
      { role: 'user', content: GREETING_PROMPT },
      { role: 'assistant', content: '你家有宠物吗？' }
    ])
  })
})

describe('ChatService modes', () => {
  const cat: Analysis = {
    errors: [
      {
        error_type: 'measure_word',
        span: '一个猫',
        correction: '一只猫',
        hanzi: '只',
        explanation: 'Use 只.'
      }
    ],
    study_words: [],
    encouragement: 'Nice.'
  }
  const service = (mode: 'sequential' | 'parallel' | 'single'): ChatService =>
    new ChatService(db, () => tutor as unknown as Tutor, {
      now: () => now,
      log: { warn: vi.fn() },
      mode
    })

  it('sequential grades against the new reply', async () => {
    tutor.replies = ['真的吗？']
    tutor.analyses = [cat]
    const sequential = service('sequential')
    const turn = await sequential.send(sequential.open('medium', '你家有宠物吗？'), '我有一个猫。')
    expect(tutor.analyzeArgs).toEqual([['我有一个猫。', '真的吗？']])
    expect(turn.errors).toHaveLength(1)
  })

  it('parallel grades against the line the student was answering', async () => {
    tutor.replies = ['真的吗？']
    tutor.analyses = [cat]
    const parallel = service('parallel')
    const turn = await parallel.send(parallel.open('medium', '你家有宠物吗？'), '我有一个猫。')
    expect(tutor.analyzeArgs).toEqual([['我有一个猫。', '你家有宠物吗？']])
    expect(turn).toMatchObject({ reply: '真的吗？', analysisFailed: false })
    expect(turn.errors[0].correction).toBe('一只猫')
  })

  it('parallel keeps the reply when grading fails and leaves history alone when the reply fails', async () => {
    const parallel = service('parallel')
    const sessionId = parallel.open('medium', '你好吗？')
    tutor.replies = ['很好！']
    tutor.analyses = [new Error('grader down')]
    expect(await parallel.send(sessionId, '我很好')).toMatchObject({
      reply: '很好！',
      analysisFailed: true
    })

    tutor.replies = [new Error('network down')]
    await expect(parallel.send(sessionId, '你呢')).rejects.toThrow('network down')
    expect(parallel.getSession(sessionId)?.history).toHaveLength(4)
  })

  it('single makes one call and uses its analysis', async () => {
    tutor.combined = [{ reply: '真的吗？', analysis: cat }]
    const single = service('single')
    const sessionId = single.open('medium', '你家有宠物吗？')
    const tokens: string[] = []
    const turn = await single.send(sessionId, '我有一个猫。', (t) => tokens.push(t.text))
    expect(tokens.join('')).toBe('真的吗？')
    expect(tutor.analyzeArgs).toHaveLength(0)
    expect(turn).toMatchObject({ reply: '真的吗？', analysisFailed: false, encouragement: 'Nice.' })
    expect(single.getSession(sessionId)?.history.at(-1)).toEqual({
      role: 'assistant',
      content: '真的吗？'
    })
  })

  it('single reports a failed analysis when the tool call is missing', async () => {
    tutor.combined = [{ reply: '好的。', analysis: null }]
    const single = service('single')
    const turn = await single.send(single.open('medium', '你好吗？'), '我很好')
    expect(turn).toMatchObject({ reply: '好的。', analysisFailed: true, errors: [], added: [] })
  })
})
