import { describe, expect, it } from 'vitest'
import {
  countSentences,
  endsWithQuestion,
  gradeAnalysis,
  matchesExpected,
  type FlaggedError
} from './grade'

const flag = (correction: string, hanzi = '', span = ''): FlaggedError => ({
  error_type: 'grammar',
  span,
  correction,
  hanzi,
  explanation: ''
})

const cat = { fix_any: ['一只猫', '只猫'], card: '只' }
const noMa = { fix_any: ['你是哪国人'], fix_none: ['哪国人吗'] }

describe('matchesExpected', () => {
  it('accepts the fix inside a longer correction, ignoring spaces and pinyin', () => {
    expect(matchesExpected(flag('我有 一只猫 (wǒ yǒu yì zhī māo)'), cat)).toBe(true)
    expect(matchesExpected(flag('三本书'), cat)).toBe(false)
  })

  it('can match on the hanzi field alone', () => {
    expect(matchesExpected(flag('Use the right measure word', '只猫'), cat)).toBe(true)
  })

  it('rejects a "correction" that still contains the mistake', () => {
    expect(matchesExpected(flag('你是哪国人？'), noMa)).toBe(true)
    expect(matchesExpected(flag('你是哪国人吗？'), noMa)).toBe(false)
  })
})

describe('gradeAnalysis on a sentence with a mistake', () => {
  const base = { expected: cat, reply: '真的吗？', analysisFailed: false }

  it('oracle: the planted mistake, correctly linked', () => {
    expect(gradeAnalysis({ ...base, errors: [flag('一只猫', '只')] })).toEqual({
      graded_right: 1,
      no_false_flag: 1,
      links_card: 1,
      ends_question: 1
    })
  })

  it('null: nothing flagged is a miss, though not a false flag', () => {
    expect(gradeAnalysis({ ...base, errors: [] })).toMatchObject({
      graded_right: 0,
      no_false_flag: 1,
      links_card: 0
    })
  })

  it('caught but pointing at the wrong card', () => {
    expect(gradeAnalysis({ ...base, errors: [flag('一只猫', '猫')] })).toMatchObject({
      graded_right: 1,
      links_card: 0
    })
  })

  it('an extra unrelated flag is a false flag', () => {
    const errors = [flag('一只猫', '只'), flag('我有', '有')]
    expect(gradeAnalysis({ ...base, errors })).toMatchObject({ graded_right: 1, no_false_flag: 0 })
  })

  it('flagging only something else is a miss and a false flag', () => {
    expect(gradeAnalysis({ ...base, errors: [flag('我有', '有')] })).toMatchObject({
      graded_right: 0,
      no_false_flag: 0
    })
  })
})

describe('gradeAnalysis on a correct sentence', () => {
  it('passes only when nothing is flagged', () => {
    const base = { reply: '好的。', analysisFailed: false }
    expect(gradeAnalysis({ ...base, errors: [] })).toEqual({
      graded_right: 1,
      no_false_flag: 1,
      ends_question: 0
    })
    expect(gradeAnalysis({ ...base, errors: [flag('在做功课', '在')] })).toMatchObject({
      graded_right: 0,
      no_false_flag: 0
    })
  })
})

describe('gradeAnalysis when there was no analysis', () => {
  it('never counts as right, even for a correct sentence', () => {
    expect(gradeAnalysis({ reply: '好的？', errors: [], analysisFailed: true })).toEqual({
      graded_right: 0,
      ends_question: 1
    })
    expect(gradeAnalysis({ expected: cat, reply: '好', errors: [], analysisFailed: true })).toEqual(
      {
        graded_right: 0,
        links_card: 0,
        ends_question: 0
      }
    )
  })
})

describe('reply checks', () => {
  it('finds a closing question mark through quotes, brackets and emoji', () => {
    expect(endsWithQuestion('你的猫叫什么名字？')).toBe(true)
    expect(endsWithQuestion('What about you? ')).toBe(true)
    expect(endsWithQuestion('你呢？😊')).toBe(true)
    expect(endsWithQuestion('(你呢？)')).toBe(true)
    expect(endsWithQuestion('很好！')).toBe(false)
    expect(endsWithQuestion('你好吗？我很好。')).toBe(false)
  })

  it('counts sentences', () => {
    expect(countSentences('你好！很高兴见到你！今天怎么样？')).toBe(3)
    expect(countSentences('Nice. How are you?')).toBe(2)
    expect(countSentences('')).toBe(0)
    expect(countSentences('真的吗？！')).toBe(1)
  })
})
