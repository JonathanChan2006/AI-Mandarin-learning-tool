import { Fragment, useMemo } from 'react'
import { annotate, longestWord, type Token } from '../pinyin/annotate'
import type { PinyinMode } from '../store/pinyinPrefs'

interface Props {
  text: string
  mode: PinyinMode
  known: ReadonlySet<string>
}

function hidden(token: Extract<Token, { kind: 'word' }>, mode: PinyinMode): boolean {
  return mode === 'hover' || (mode === 'new' && token.known)
}

/** Text with pinyin as ruby annotations; hidden pinyin appears when the word is hovered. */
export function PinyinText({ text, mode, known }: Props): React.JSX.Element {
  const maxLength = useMemo(() => longestWord(known), [known])
  const tokens = useMemo(() => annotate(text, known, maxLength), [text, known, maxLength])
  return (
    <span className="pinyin-text">
      {tokens.map((token, i) =>
        token.kind === 'text' ? (
          <Fragment key={i}>{token.text}</Fragment>
        ) : (
          <ruby
            key={i}
            className={hidden(token, mode) ? 'pinyin-hidden' : undefined}
            data-known={token.known ? 'true' : undefined}
          >
            {token.chars.map((c, j) => (
              <Fragment key={j}>
                {c.hanzi}
                <rt>{c.pinyin}</rt>
              </Fragment>
            ))}
          </ruby>
        )
      )}
    </span>
  )
}
