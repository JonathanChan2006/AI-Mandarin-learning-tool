import { describe, expect, it } from 'vitest'
import { openDatabase } from './db'
import { findByHanzi } from './items'
import { loadSeed, SEED_WORDS } from './seed'

describe('loadSeed', () => {
  it('loads the 40 starter words once and tags them hsk1', () => {
    const db = openDatabase(':memory:')
    expect(SEED_WORDS).toHaveLength(40)
    expect(loadSeed(db)).toEqual({ added: 40, total: 40 })
    expect(loadSeed(db)).toEqual({ added: 0, total: 40 })
    const hello = findByHanzi(db, '你好')!
    expect(hello.pinyin).toBe('nǐ hǎo')
    expect(hello.tags).toBe('hsk1')
  })
})
