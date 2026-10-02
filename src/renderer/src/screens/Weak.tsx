import { useState } from 'react'
import { errorMessage } from '../api'
import { Screen } from '../components/Screen'
import { useMistakes, useWeakItems } from '../queries'
import { formatTimestamp } from '@shared/format'

type Tab = 'weak' | 'log'

export default function Weak(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('weak')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'weak', label: 'Weak words' },
    { id: 'log', label: 'Mistake log' }
  ]
  return (
    <Screen
      title="Weak words"
      subtitle="Recency-weighted: old mistakes fade, getting a word right removes it."
      actions={
        <div role="tablist" className="flex rounded-full bg-white/5 p-1 text-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 transition ${
                tab === t.id ? 'bg-white/15 text-ink' : 'text-ink-faint hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'weak' ? <WeakList /> : <MistakeLog />}
    </Screen>
  )
}

function WeakList(): React.JSX.Element {
  const weak = useWeakItems(50)
  if (weak.isError) return <p className="text-danger">{errorMessage(weak.error)}</p>
  if (!weak.data) return <p className="text-ink-faint">Loading…</p>
  if (weak.data.length === 0) {
    return (
      <div className="pt-6">
        <p className="text-lg">No weak words yet</p>
        <p className="text-ink-faint">
          They show up here as you make mistakes drilling or chatting.
        </p>
      </div>
    )
  }
  return (
    <ul className="divide-y divide-white/5">
      {weak.data.map((item) => (
        <li key={item.id} className="flex items-baseline gap-4 py-2">
          <span className="w-11 text-right text-accent tabular-nums">{item.score.toFixed(1)}</span>
          <span className="w-[70px] text-lg">{item.hanzi}</span>
          <span className="w-[110px] text-pinyin">{item.pinyin}</span>
          <span className="min-w-0 flex-1 truncate text-ink-muted">{item.gloss}</span>
        </li>
      ))}
    </ul>
  )
}

function MistakeLog(): React.JSX.Element {
  const mistakes = useMistakes(200)
  if (mistakes.isError) return <p className="text-danger">{errorMessage(mistakes.error)}</p>
  if (!mistakes.data) return <p className="text-ink-faint">Loading…</p>
  if (mistakes.data.length === 0)
    return <p className="pt-6 text-ink-faint">No mistakes logged yet.</p>
  return (
    <ul className="divide-y divide-white/5 text-sm">
      {mistakes.data.map((m) => (
        <li key={m.id} className="flex flex-col gap-0.5 py-2">
          <div className="flex gap-3 text-xs text-ink-faint">
            <span>{formatTimestamp(m.ts)}</span>
            <span>
              [{m.source}/{m.error_type}]
            </span>
          </div>
          <div>
            {m.user_said && <span className="text-danger line-through">{m.user_said} </span>}
            <span>{m.expected || m.note}</span>
          </div>
          {m.user_said && m.note && <div className="text-ink-muted">{m.note}</div>}
        </li>
      ))}
    </ul>
  )
}
