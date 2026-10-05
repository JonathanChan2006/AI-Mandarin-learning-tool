import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TypingPrefs {
  /** The chat banner was closed; Settings still shows the setup steps. */
  bannerDismissed: boolean
  dismissBanner: () => void
}

export const useTypingPrefs = create<TypingPrefs>()(
  persist(
    (set) => ({ bannerDismissed: false, dismissBanner: () => set({ bannerDismissed: true }) }),
    {
      name: 'typing-prefs'
    }
  )
)
