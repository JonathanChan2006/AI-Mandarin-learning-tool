import { useState } from 'react'
import { errorMessage } from '../api'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { TypingSettings } from '../components/TypingSetup'
import {
  useClearKey,
  useImportLegacyKey,
  useLegacyImport,
  useSaveKey,
  useSettings,
  useStats
} from '../queries'
import { useChatStore } from '../store/chatStore'
import { plural } from '@shared/format'

interface Notice {
  tone: 'ok' | 'error'
  text: string
}

function NoticeLine({ notice }: { notice: Notice | null }): React.JSX.Element | null {
  if (!notice) return null
  return (
    <p role="status" className={`text-sm ${notice.tone === 'ok' ? 'text-pinyin' : 'text-danger'}`}>
      {notice.text}
    </p>
  )
}

export default function Settings(): React.JSX.Element {
  const settings = useSettings()
  const stats = useStats()
  const saveKey = useSaveKey()
  const clearKey = useClearKey()
  const importKey = useImportLegacyKey()
  const legacyImport = useLegacyImport()
  const resetChat = useChatStore((s) => s.reset)

  const [key, setKey] = useState('')
  const [reveal, setReveal] = useState(false)
  const [deleteOldFile, setDeleteOldFile] = useState(false)
  const [keyNotice, setKeyNotice] = useState<Notice | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [dataNotice, setDataNotice] = useState<Notice | null>(null)

  const data = settings.data
  const words = stats.data?.words ?? 0

  // A changed key should take effect in an open chat straight away.
  const keyChanged = (text: string): void => {
    setKeyNotice({ tone: 'ok', text })
    resetChat()
  }

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      await saveKey.mutateAsync(key.trim())
      setKey('')
      keyChanged('Saved. Chat is ready to use.')
    } catch (error) {
      setKeyNotice({ tone: 'error', text: errorMessage(error) })
    }
  }

  const remove = async (): Promise<void> => {
    try {
      await clearKey.mutateAsync()
      keyChanged('Key removed.')
    } catch (error) {
      setKeyNotice({ tone: 'error', text: errorMessage(error) })
    }
  }

  const importOldKey = async (): Promise<void> => {
    try {
      await importKey.mutateAsync(deleteOldFile)
      keyChanged('Key imported from the old app.')
    } catch (error) {
      setKeyNotice({ tone: 'error', text: errorMessage(error) })
    }
  }

  const importOldData = async (replace: boolean): Promise<void> => {
    setConfirmReplace(false)
    setDataNotice(null)
    try {
      const result = await legacyImport.mutateAsync(replace)
      if (!result) return // dialog cancelled
      const summary = `Imported ${plural(result.items, 'card')}, ${plural(result.reviews, 'review')} and ${plural(result.mistakes, 'mistake')}.`
      const backup = result.backup ? ` Your previous data was saved to ${result.backup}.` : ''
      setDataNotice({ tone: 'ok', text: summary + backup })
      resetChat()
    } catch (error) {
      setDataNotice({ tone: 'error', text: errorMessage(error) })
    }
  }

  let status = 'Checking…'
  if (settings.isError) status = errorMessage(settings.error)
  else if (data?.source === 'env')
    status = 'Using the key from the ANTHROPIC_API_KEY environment variable.'
  else if (data?.source === 'stored') status = 'A key is saved on this computer.'
  else if (data) status = 'No key yet. The chat tutor needs one.'

  const busy = saveKey.isPending || clearKey.isPending || importKey.isPending

  return (
    <Screen title="Settings">
      <div className="flex max-w-[560px] flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Anthropic API key</h2>
          <p className="text-sm text-ink-faint">
            The chat tutor uses your own key. It is encrypted with this computer&apos;s keychain and
            never leaves this machine.
          </p>
          <p className={data?.hasKey ? 'text-pinyin' : 'text-ink-muted'}>{status}</p>
          {data?.source === 'env' && (
            <p className="text-sm text-ink-faint">
              A key saved here is only used when that variable is not set.
            </p>
          )}
          {data && !data.encryptionAvailable && (
            <p className="text-sm text-accent">
              This system cannot encrypt a saved key. Set ANTHROPIC_API_KEY in your environment
              instead.
            </p>
          )}

          <form onSubmit={(e) => void save(e)} className="flex items-center gap-2">
            <input
              type={reveal ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              aria-label="Anthropic API key"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-surface px-3 py-2 outline-none select-text focus:border-primary"
            />
            <Button variant="ghost" onClick={() => setReveal(!reveal)}>
              {reveal ? 'Hide' : 'Show'}
            </Button>
            <Button
              type="submit"
              disabled={busy || key.trim().length < 10 || data?.encryptionAvailable === false}
            >
              {saveKey.isPending ? 'Checking…' : 'Save'}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            {data?.source === 'stored' && (
              <Button variant="outlined" disabled={busy} onClick={() => void remove()}>
                Remove key
              </Button>
            )}
            {data?.legacyKeyFile && (
              <>
                <Button variant="outlined" disabled={busy} onClick={() => void importOldKey()}>
                  Import key from the old Python app
                </Button>
                <label className="flex items-center gap-2 text-sm text-ink-faint">
                  <input
                    type="checkbox"
                    checked={deleteOldFile}
                    onChange={(e) => setDeleteOldFile(e.target.checked)}
                  />
                  then delete the old plain-text file
                </label>
              </>
            )}
          </div>
          <NoticeLine notice={keyNotice} />
        </section>

        <TypingSettings />

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Your data</h2>
          <p className="text-sm text-ink-faint">
            Cards, reviews and mistakes live in one file on this computer:
          </p>
          <p className="rounded-md bg-white/5 px-3 py-2 font-mono text-xs break-all select-text">
            {data?.dbPath ?? '…'}
          </p>
          <p className="text-sm text-ink-faint">
            Used the Python version before? Bring its cards, review history and mistakes across by
            choosing its <span className="font-mono">mandarin.db</span> file.
          </p>
          {confirmReplace ? (
            <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-4">
              <p>
                This replaces the {plural(words, 'card')} in this app with your old data. A backup
                copy is saved first.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => void importOldData(true)}>Replace with my old data</Button>
                <Button variant="ghost" onClick={() => setConfirmReplace(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="outlined"
                disabled={legacyImport.isPending || !stats.isSuccess}
                onClick={() => (words > 0 ? setConfirmReplace(true) : void importOldData(false))}
              >
                {legacyImport.isPending ? 'Importing…' : 'Import my old database'}
              </Button>
            </div>
          )}
          <NoticeLine notice={dataNotice} />
        </section>
      </div>
    </Screen>
  )
}
