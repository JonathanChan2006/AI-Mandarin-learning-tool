import { useEffect } from 'react'
import type { Grade } from '@shared/types'

interface Handlers {
  onReveal: () => void
  onGrade: (grade: Grade) => void
  enabled: boolean
}

function inEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Space or Enter reveals the card; 1-4 grade it. Ignored while typing in a field. */
export function useReviewShortcuts({ onReveal, onGrade, enabled }: Handlers): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      // 229 is what browsers report while an input method is composing.
      if (event.isComposing || event.keyCode === 229) return
      if (inEditableElement(event.target)) return
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        onReveal()
      } else if (['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault()
        onGrade(Number(event.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onReveal, onGrade, enabled])
}
