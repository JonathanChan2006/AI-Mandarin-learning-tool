import { describe, expect, it } from 'vitest'
import { annotate, type Token } from './annotate'

const words = (tokens: Token[]): string[] =>
  tokens.map((t) => (t.kind === 'text' ? `[${t.text}]` : t.chars.map((c) => c.hanzi).join('')))
const readings = (tokens: Token[]): string[] =>
  tokens.flatMap((t) => (t.kind === 'word' ? t.chars.map((c) => c.pinyin) : []))
const rebuild = (tokens: Token[]): string =>
  tokens.map((t) => (t.kind === 'text' ? t.text : t.chars.map((c) => c.hanzi).join(''))).join('')

describe('annotate', () => {
  it('gives every hanzi its pinyin and leaves punctuation as text', () => {
    const tokens = annotate('我有一只猫。', new Set())
    expect(words(tokens)).toEqual(['我', '有', '一', '只', '猫', '[。]'])
    expect(readings(tokens)).toEqual(['wǒ', 'yǒu', 'yì', 'zhī', 'māo'])
  })

  it('uses context for characters with several readings', () => {
    expect(readings(annotate('银行', new Set()))).toEqual(['yín', 'háng'])
    expect(readings(annotate('行走', new Set()))[0]).toBe('xíng')
    expect(readings(annotate('长大了', new Set()))[0]).toBe('zhǎng')
    expect(readings(annotate('很长', new Set()))[1]).toBe('cháng')
    expect(readings(annotate('好了', new Set()))[1]).toBe('le')
  })

  it('groups known words longest-first and marks them known', () => {
    const tokens = annotate('我是你的中文老师。', new Set(['老师', '中文', '我', '老']))
    expect(words(tokens)).toEqual(['我', '是', '你', '的', '中文', '老师', '[。]'])
    const known = tokens.filter((t) => t.kind === 'word' && t.known)
    expect(
      known.map((t) => (t.kind === 'word' ? t.chars.map((c) => c.hanzi).join('') : ''))
    ).toEqual(['我', '中文', '老师'])
  })

  it('keeps English, pinyin and spacing untouched', () => {
    const text = '养宠物 (chǒngwù, pet) 不太方便。OK吧？'
    const tokens = annotate(text, new Set())
    expect(rebuild(tokens)).toBe(text)
    expect(tokens).toContainEqual({ kind: 'text', text: ' (chǒngwù, pet) ' })
  })

  it('returns plain text when there is no Chinese', () => {
    expect(annotate('Hello there!', new Set())).toEqual([{ kind: 'text', text: 'Hello there!' }])
    expect(annotate('', new Set())).toEqual([])
  })

  it('never matches known words across punctuation', () => {
    const tokens = annotate('中，文', new Set(['中文']))
    expect(tokens.every((t) => t.kind === 'text' || !t.known)).toBe(true)
  })
})
