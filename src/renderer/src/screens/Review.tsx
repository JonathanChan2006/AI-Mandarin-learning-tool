import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { call, errorMessage } from '../api'
import { Button } from '../components/Button'
import { useReviewShortcuts } from '../hooks/useReviewShortcuts'
import { keys, useGradeCard } from '../queries'
import type { QueueItem, ReviewQueue } from '@shared/contract'
import { formatInterval, plural } from '@shared/format'
import { GRADE_LABELS, GRADES, type Grade } from '@shared/types'

interface Session {
  items: QueueItem[]
  index: number
  revealed: boolean
  reviewed: number
  done: boolean
  nextDueAt: number | null
}

/** Only announce a countdown when the next card is at most an hour away. */
const RETURN_WINDOW_MS = 60 * 60 * 1000

function sessionFrom(queue: ReviewQueue, reviewed: number): Session {
  return {
    items: queue.items,
    index: 0,
    revealed: false,
    reviewed,
    done: queue.items.length === 0,
    nextDueAt: queue.nextDueAt
  }
}

export default function Review(): React.JSX.Element {
  const navigate = useNavigate()
  const grade = useGradeCard()
  // Fresh queue on every visit; the cache is dropped when the screen unmounts.
  const queue = useQuery({
    queryKey: keys.reviewQueue,
    queryFn: () => call('review:queue'),
    staleTime: Infinity,
    gcTime: 0
  })
  // Until the user acts, the session is derived from the loaded queue.
  const [session, setSession] = useState<Session | null>(null)
  const active = session ?? (queue.data ? sessionFrom(queue.data, 0) : null)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  const refill = useCallback(
    async (reviewed: number) => {
      const fresh = await queue.refetch()
      setSession(sessionFrom(fresh.data ?? { items: [], nextDueAt: null }, reviewed))
    },
    [queue]
  )

  // On the done screen, count down to the next due card and pull it in when it lands.
  const doneAwaiting = active?.done ? active.nextDueAt : null
  const reviewedSoFar = active?.reviewed ?? 0
  useEffect(() => {
    if (doneAwaiting === null) return
    let refilled = false
    const tick = (): void => {
      const left = doneAwaiting - Date.now()
      setRemaining(left)
      if (left <= 0 && !refilled) {
        refilled = true
        void refill(reviewedSoFar)
      }
    }
    const first = window.setTimeout(tick, 0)
    const interval = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [doneAwaiting, reviewedSoFar, refill])

  const reveal = useCallback(() => {
    if (active && !active.done && !active.revealed) setSession({ ...active, revealed: true })
  }, [active])

  const gradeCurrent = useCallback(
    async (rating: Grade) => {
      if (!active || active.done || !active.revealed || grade.isPending) return
      const item = active.items[active.index]
      try {
        await grade.mutateAsync({ itemId: item.id, rating })
        setError(null)
      } catch (err) {
        setError(errorMessage(err))
        return
      }
      const reviewed = active.reviewed + 1
      if (active.index + 1 < active.items.length) {
        setSession({ ...active, index: active.index + 1, revealed: false, reviewed })
      } else {
        await refill(reviewed)
      }
    },
    [active, grade, refill]
  )

  useReviewShortcuts({ onReveal: reveal, onGrade: gradeCurrent, enabled: !!active && !active.done })

  if (queue.isError) return <p className="text-danger">{errorMessage(queue.error)}</p>
  if (!active) return <p className="text-ink-faint">Loading…</p>

  if (active.done) {
    const showCountdown = remaining !== null && remaining <= RETURN_WINDOW_MS
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-[26px] font-semibold">Done for now.</p>
        <p className="text-ink-muted">Reviewed {plural(active.reviewed, 'card')}.</p>
        {showCountdown && (
          <p className="text-sm text-ink-faint">
            Next card due in {formatInterval(Math.max(remaining, 0))}.
          </p>
        )}
        <div className="mt-2 flex gap-3">
          {active.nextDueAt !== null && (
            <Button variant="outlined" onClick={() => void refill(active.reviewed)}>
              Check again
            </Button>
          )}
          <Button onClick={() => navigate('/')}>Back to home</Button>
        </div>
      </div>
    )
  }

  const item = active.items[active.index]
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="text-xs text-ink-faint">
        {active.index + 1} / {active.items.length}
      </p>
      <p className="text-[72px] leading-tight font-bold">{item.hanzi}</p>
      {!active.revealed ? (
        <Button onClick={reveal}>Reveal</Button>
      ) : (
        <>
          <p className="text-[26px] text-pinyin">{item.pinyin}</p>
          <p className="text-lg">{item.gloss}</p>
          {item.example && <p className="text-[15px] text-ink-muted italic">{item.example}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {GRADES.map((g) => (
              <Button
                key={g}
                variant="outlined"
                disabled={grade.isPending}
                onClick={() => void gradeCurrent(g)}
                className="min-w-[88px] flex-col gap-0 leading-tight"
              >
                <span>{GRADE_LABELS[g]}</span>
                <span className="text-xs text-ink-faint">+{formatInterval(item.intervals[g])}</span>
              </Button>
            ))}
          </div>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="mt-4 text-xs text-ink-faint">Space to reveal · 1–4 to grade</p>
    </div>
  )
}
