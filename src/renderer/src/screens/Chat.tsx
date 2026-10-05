import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { PinyinText } from '../components/PinyinText'
import { TypingBanner } from '../components/TypingSetup'
import { invalidateStudyData, useKnownWords, useSettings } from '../queries'
import { useChatStore, type NoteTone } from '../store/chatStore'
import { PINYIN_MODES, usePinyinPrefs, type PinyinMode } from '../store/pinyinPrefs'
import { LEVELS, type Level } from '@shared/types'

const noteColor: Record<NoteTone, string> = {
  amber: 'text-accent',
  green: 'text-pinyin',
  grey: 'text-ink-faint',
  muted: 'text-ink-muted italic',
  red: 'text-danger'
}

export default function Chat(): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const settings = useSettings()
  const knownWords = useKnownWords()
  const known = useMemo(() => new Set(knownWords.data ?? []), [knownWords.data])
  const pinyinMode = usePinyinPrefs((s) => s.mode)
  const setPinyinMode = usePinyinPrefs((s) => s.setMode)
  const sessionId = useChatStore((s) => s.sessionId)
  const level = useChatStore((s) => s.level)
  const messages = useChatStore((s) => s.messages)
  const notes = useChatStore((s) => s.notes)
  const pending = useChatStore((s) => s.pending)
  const error = useChatStore((s) => s.error)
  const errorCode = useChatStore((s) => s.errorCode)
  const start = useChatStore((s) => s.start)
  const send = useChatStore((s) => s.send)
  const changeLevel = useChatStore((s) => s.changeLevel)
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // True while an input method is still choosing characters; Enter then picks a word, not "send".
  const composing = useRef(false)

  const hasKey = settings.data?.hasKey ?? false

  // Open a session the first time the screen is visited with a key available.
  useEffect(() => {
    if (hasKey && !sessionId && !pending && error === null) void start()
  }, [hasKey, sessionId, pending, error, start])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const value = text.trim()
    if (!value || pending || composing.current) return
    setText('')
    const sent = await send(value)
    if (sent) void invalidateStudyData(queryClient)
    else setText(value)
    inputRef.current?.focus()
  }

  if (settings.isSuccess && !hasKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-xl font-semibold">Chat needs an API key</p>
        <p className="text-ink-muted">
          Add your Anthropic key once in Settings; it stays on this machine.
        </p>
        <Button onClick={() => navigate('/settings')}>Open Settings</Button>
      </div>
    )
  }

  const streaming = messages.some((m) => m.streaming)

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">老师 (Lǎoshī)</h1>
        <label className="flex items-center gap-2 text-sm text-ink-faint">
          level:
          <select
            value={level}
            disabled={pending}
            onChange={(e) => void changeLevel(e.target.value as Level)}
            className="w-[140px] rounded-md border border-white/15 bg-surface px-2 py-1 text-ink"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-faint">
          pinyin:
          <select
            value={pinyinMode}
            onChange={(e) => setPinyinMode(e.target.value as PinyinMode)}
            className="w-[120px] rounded-md border border-white/15 bg-surface px-2 py-1 text-ink"
          >
            {PINYIN_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {error && errorCode !== 'NO_API_KEY' && (
          <span className="text-sm text-danger">{error}</span>
        )}
        {error && errorCode === 'NO_API_KEY' && (
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            Open Settings
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <div ref={listRef} className="flex min-w-0 flex-1 flex-col gap-2 overflow-auto pr-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                data-testid="bubble"
                data-role={m.role}
                data-text={m.text}
                className={`max-w-[70%] rounded-xl p-3 whitespace-pre-wrap select-text ${
                  m.role === 'user' ? 'bg-bubble-user' : 'bg-white/10 text-lg'
                }`}
              >
                {m.role === 'tutor' ? (
                  <PinyinText text={m.text} mode={pinyinMode} known={known} />
                ) : (
                  m.text
                )}
                {m.streaming && <span className="animate-pulse">▍</span>}
              </div>
            </div>
          ))}
          {pending && !streaming && <p className="text-sm text-ink-faint">老师 is thinking…</p>}
        </div>
        <aside className="flex w-[300px] shrink-0 flex-col gap-2 overflow-auto border-l border-white/10 pl-4">
          <h2 className="text-sm font-semibold text-ink-muted">Notes &amp; corrections</h2>
          {notes.map((note) => (
            <p
              key={note.id}
              className={`text-[13px] whitespace-pre-wrap select-text ${noteColor[note.tone]}`}
            >
              {note.text}
            </p>
          ))}
        </aside>
      </div>

      <TypingBanner />

      <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type in Chinese or English..."
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || composing.current))
              e.preventDefault()
          }}
          disabled={pending || !sessionId}
          autoFocus
          className="flex-1 rounded-md border border-white/15 bg-surface px-3 py-2 outline-none focus:border-primary disabled:opacity-60"
        />
        {pending && (
          <span
            aria-label="Waiting for the tutor"
            className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/20 border-t-primary"
          />
        )}
        <Button type="submit" disabled={pending || !sessionId || !text.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}
