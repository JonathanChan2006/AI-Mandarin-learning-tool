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

  async analyze(): Promise<Analysis> {
    const next = this.analyses.shift() ?? EMPTY_ANALYSIS
    if (next instanceof Error) throw next
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
