import { useState } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '../api'
import { AddCardDialog } from '../components/AddCardDialog'
import { Button } from '../components/Button'
import { StatTile } from '../components/StatTile'
import { useLoadSeed, useStats } from '../queries'
import { plural } from '@shared/format'

export default function Home(): React.JSX.Element {
  const navigate = useNavigate()
  const stats = useStats()
  const seed = useLoadSeed()
  const [adding, setAdding] = useState(false)

  const due = stats.data?.due ?? 0
  const empty = stats.isSuccess && stats.data.words === 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[34px] font-bold">你好</p>
        <p className="text-ink-muted">
          Mandarin flashcards and an AI tutor that targets your mistakes.
        </p>
      </div>
      <hr className="border-white/10" />
      <div className="flex flex-wrap gap-3">
        <StatTile label="words" value={stats.data?.words ?? '–'} />
        <StatTile label="due now" value={stats.data?.due ?? '–'} />
        <StatTile label="reviews" value={stats.data?.reviews ?? '–'} />
        <StatTile label="mistakes" value={stats.data?.mistakes ?? '–'} />
      </div>
      {stats.isError && <p className="text-danger">{errorMessage(stats.error)}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={due === 0} onClick={() => navigate('/review')}>
          Review {plural(due, 'due card')}
        </Button>
        <Button variant="outlined" onClick={() => setAdding(true)}>
          Add a card
        </Button>
      </div>
      {empty && (
        <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-5">
          <p className="font-medium">Your deck is empty.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outlined" disabled={seed.isPending} onClick={() => seed.mutate()}>
              Load 40 starter words
            </Button>
            <Button variant="outlined" onClick={() => navigate('/import')}>
              Import an Anki deck
            </Button>
            <Button variant="outlined" onClick={() => navigate('/settings')}>
              Import my old database
            </Button>
          </div>
          {seed.isError && <p className="text-danger">{errorMessage(seed.error)}</p>}
        </div>
      )}
      <AddCardDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
