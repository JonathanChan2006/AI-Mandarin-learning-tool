import { describe, expect, it } from 'vitest'
import { CHANNELS } from './channels'
import { contract } from './contract'

describe('contract', () => {
  it('covers every channel', () => {
    expect(Object.keys(contract).sort()).toEqual([...CHANNELS].sort())
  })

  it('applies defaults to list inputs', () => {
    expect(contract['weak:list'].input.parse({})).toEqual({ limit: 50 })
    expect(contract['mistakes:list'].input.parse({ limit: 5 })).toEqual({ limit: 5, offset: 0 })
  })

  it('trims and defaults a new card', () => {
    expect(contract['items:add'].input.parse({ hanzi: ' 猫 ', pinyin: ' māo ' })).toEqual({
      hanzi: '猫',
      pinyin: 'māo',
      gloss: '',
      example: '',
      type: 'vocab',
      tags: ''
    })
    expect(contract['items:add'].input.safeParse({ hanzi: '  ' }).success).toBe(false)
  })

  it('rejects bad grades and empty chat text', () => {
    expect(contract['review:grade'].input.safeParse({ itemId: 1, rating: 5 }).success).toBe(false)
    expect(contract['review:grade'].input.safeParse({ itemId: 1, rating: 4 }).success).toBe(true)
    expect(contract['chat:send'].input.safeParse({ sessionId: 's', text: '   ' }).success).toBe(
      false
    )
  })

  it('accepts undefined for void inputs', () => {
    expect(contract['stats:get'].input.safeParse(undefined).success).toBe(true)
  })
})
