import { pinyin } from 'pinyin-pro'

export interface AnnotatedChar {
  hanzi: string
  pinyin: string
}

/** A run of text to render: plain text, or one or more hanzi with pinyin. */
export type Token =
  { kind: 'text'; text: string } | { kind: 'word'; chars: AnnotatedChar[]; known: boolean }

const HAN = /\p{Script=Han}/u

export function longestWord(words: Iterable<string>): number {
  let max = 0
  for (const word of words) max = Math.max(max, [...word].length)
  return max
}

/**
 * Split text into plain runs and hanzi with context-aware pinyin (pinyin-pro
 * resolves readings like 银行 háng / 行走 xíng and tone sandhi like 一只 yì).
 * Words the learner knows are matched longest-first and marked `known`, so
 * 老师 is one known word rather than two characters.
 */
export function annotate(
  text: string,
  known: ReadonlySet<string>,
  maxKnownLength: number = longestWord(known)
): Token[] {
  if (!HAN.test(text)) return text ? [{ kind: 'text', text }] : []
  const items = pinyin(text, { type: 'all' })
  // Only annotate when the library's split reproduces the text exactly.
  if (items.map((item) => item.origin).join('') !== text) return [{ kind: 'text', text }]

  const tokens: Token[] = []
  const isHan = (i: number): boolean => items[i].isZh && HAN.test(items[i].origin)
  const pushText = (value: string): void => {
    const last = tokens[tokens.length - 1]
    if (last && last.kind === 'text') last.text += value
    else tokens.push({ kind: 'text', text: value })
  }

  let i = 0
  while (i < items.length) {
    if (!isHan(i)) {
      pushText(items[i].origin)
      i++
      continue
    }
    let runEnd = i
    while (runEnd < items.length && isHan(runEnd)) runEnd++
    let matched = 0
    for (let len = Math.min(maxKnownLength, runEnd - i); len >= 1; len--) {
      const candidate = items
        .slice(i, i + len)
        .map((item) => item.origin)
        .join('')
      if (known.has(candidate)) {
        matched = len
        break
      }
    }
    const length = matched || 1
    tokens.push({
      kind: 'word',
      known: matched > 0,
      chars: items.slice(i, i + length).map((item) => ({ hanzi: item.origin, pinyin: item.pinyin }))
    })
    i += length
  }
  return tokens
}
