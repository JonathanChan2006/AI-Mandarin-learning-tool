import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * How much pinyin to show over the tutor's messages:
 *   new   - over every word except the ones you already know (default)
 *   all   - over every word
 *   hover - none until you hover a word
 */
export type PinyinMode = 'new' | 'all' | 'hover'

export const PINYIN_MODES: { value: PinyinMode; label: string }[] = [
  { value: 'new', label: 'new words' },
  { value: 'all', label: 'all' },
  { value: 'hover', label: 'on hover' }
]

interface PinyinPrefs {
  mode: PinyinMode
  setMode: (mode: PinyinMode) => void
}

export const usePinyinPrefs = create<PinyinPrefs>()(
  persist((set) => ({ mode: 'new', setMode: (mode) => set({ mode }) }), { name: 'pinyin-prefs' })
)
