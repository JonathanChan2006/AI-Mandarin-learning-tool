import { useState } from 'react'
import { errorMessage } from '../api'
import { useOpenKeyboardSettings, useTypingStatus } from '../queries'
import { useTypingPrefs } from '../store/typingPrefs'
import { Button } from './Button'
import type { TypingInfo } from '@shared/contract'

type Platform = TypingInfo['platform']

const STEPS: Record<Platform, { button: string; steps: string[]; switchWith: string }> = {
  mac: {
    button: 'Open Keyboard Settings',
    steps: [
      'Under Text Input, click Edit, then the + button.',
      'Choose Chinese, Simplified, then Pinyin – Simplified, and click Add.',
      'Come back here.'
    ],
    switchWith: 'Control+Space (or the Globe key)'
  },
  windows: {
    button: 'Open Language Settings',
    steps: [
      'Click Add a language and choose Chinese (Simplified, China).',
      'Install it. Microsoft Pinyin comes with it.',
      'Come back here.'
    ],
    switchWith: 'Windows+Space'
  },
  other: {
    button: 'Open Keyboard Settings',
    steps: [
      'Add a Chinese pinyin input method in your system keyboard settings.',
      'Come back here.'
    ],
    switchWith: "your system's input switch shortcut"
  }
}

/** The numbered steps and the button that opens the right system page. */
export function TypingSteps({ platform }: { platform: Platform }): React.JSX.Element {
  const open = useOpenKeyboardSettings()
  const status = useTypingStatus()
  const guide = STEPS[platform]
  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>Click {guide.button} below.</li>
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="text-sm text-ink-faint">
        Then press {guide.switchWith} to switch to Chinese. Type pinyin without tones, such as{' '}
        <span className="font-mono">nihao</span>, and press Space to get 你好.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {platform !== 'other' && (
          <Button disabled={open.isPending} onClick={() => open.mutate()}>
            {guide.button}
          </Button>
        )}
        <Button
          variant="outlined"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          Check again
        </Button>
      </div>
      {open.isError && <p className="text-sm text-danger">{errorMessage(open.error)}</p>}
    </div>
  )
}

/** Shown in the chat while no Chinese keyboard is turned on. */
export function TypingBanner(): React.JSX.Element | null {
  const status = useTypingStatus()
  const dismissed = useTypingPrefs((s) => s.bannerDismissed)
  const dismiss = useTypingPrefs((s) => s.dismissBanner)
  const [expanded, setExpanded] = useState(false)

  if (status.data?.status !== 'missing' || dismissed) return null
  return (
    <div role="note" className="flex flex-col gap-3 rounded-xl bg-white/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          No Chinese keyboard is turned on, so you can only type pinyin letters. It takes a minute
          to add one.
        </span>
        <Button variant="outlined" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide steps' : 'Show me how'}
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
      {expanded && <TypingSteps platform={status.data.platform} />}
    </div>
  )
}

/** The Settings section: current status plus the steps when something is missing. */
export function TypingSettings(): React.JSX.Element {
  const status = useTypingStatus()
  const info = status.data
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Typing Chinese</h2>
      <p className="text-sm text-ink-faint">
        To write characters you need a pinyin keyboard from your operating system. You type the
        sound and it offers the characters.
      </p>
      {!info && <p className="text-ink-muted">Checking…</p>}
      {info?.status === 'enabled' && (
        <p className="text-pinyin">A Chinese keyboard is turned on.</p>
      )}
      {info?.status === 'missing' && (
        <>
          <p className="text-accent">No Chinese keyboard is turned on yet.</p>
          <TypingSteps platform={info.platform} />
        </>
      )}
      {info?.status === 'unknown' && (
        <>
          <p className="text-ink-muted">Couldn&apos;t check which keyboards are turned on.</p>
          <TypingSteps platform={info.platform} />
        </>
      )}
    </section>
  )
}
