import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { errorMessage } from '../api'
import { useAddCard } from '../queries'

interface Props {
  open: boolean
  onClose: () => void
}

const empty = { hanzi: '', pinyin: '', gloss: '', example: '' }

export function AddCardDialog({ open, onClose }: Props): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState(empty)
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const add = useAddCard()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const update = (field: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value })

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      const { id } = await add.mutateAsync(form)
      if (id === null) {
        setStatus({ tone: 'warn', text: `${form.hanzi.trim()} is already in your deck.` })
      } else {
        setStatus({ tone: 'ok', text: `Added ${form.hanzi.trim()}.` })
        setForm(empty)
      }
    } catch (error) {
      setStatus({ tone: 'error', text: errorMessage(error) })
    }
  }

  const toneClass = { ok: 'text-pinyin', warn: 'text-accent', error: 'text-danger' }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[420px] rounded-xl bg-surface-raised p-6 text-ink shadow-xl"
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Add a card</h2>
        {(['hanzi', 'pinyin', 'gloss', 'example'] as const).map((field) => (
          <label key={field} className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint capitalize">
              {field === 'gloss' ? 'meaning' : field}
            </span>
            <input
              value={form[field]}
              onChange={update(field)}
              required={field === 'hanzi'}
              autoFocus={field === 'hanzi'}
              className="rounded-md border border-white/15 bg-surface px-3 py-2 text-base outline-none focus:border-primary"
            />
          </label>
        ))}
        {status && <p className={`text-sm ${toneClass[status.tone]}`}>{status.text}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" disabled={add.isPending || !form.hanzi.trim()}>
            Add
          </Button>
        </div>
      </form>
    </dialog>
  )
}
