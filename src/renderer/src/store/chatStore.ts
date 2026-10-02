import { create } from 'zustand'
import { ApiError, call, errorMessage, onChatToken } from '../api'
import type { ChatToken } from '@shared/contract'
import { DEFAULT_LEVEL, type Level } from '@shared/types'

export type NoteTone = 'amber' | 'green' | 'grey' | 'muted' | 'red'

export interface ChatMessage {
  id: string
  role: 'user' | 'tutor'
  text: string
  /** True while tokens are still arriving for this message. */
  streaming: boolean
}

export interface Note {
  id: string
  tone: NoteTone
  text: string
}

interface ChatState {
  sessionId: string | null
  level: Level
  messages: ChatMessage[]
  notes: Note[]
  pending: boolean
  error: string | null
  errorCode: string | null
  start: (level?: Level) => Promise<void>
  /** Resolves true when the turn completed; false means the text should go back in the box. */
  send: (text: string) => Promise<boolean>
  changeLevel: (level: Level) => Promise<void>
  reset: () => void
}

let nextId = 0
const id = (): string => `m${nextId++}`

let unsubscribe: (() => void) | null = null

/** Attach the token stream once; tokens append to whichever message is streaming. */
function ensureSubscribed(set: (fn: (s: ChatState) => Partial<ChatState>) => void): void {
  if (unsubscribe) return
  unsubscribe = onChatToken((token: ChatToken) => {
    set((state) => {
      if (token.sessionId !== state.sessionId && state.sessionId !== null) return {}
      const last = state.messages[state.messages.length - 1]
      if (last && last.role === 'tutor' && last.streaming) {
        return {
          messages: [...state.messages.slice(0, -1), { ...last, text: last.text + token.text }]
        }
      }
      return {
        messages: [
          ...state.messages,
          { id: id(), role: 'tutor', text: token.text, streaming: true }
        ]
      }
    })
  })
}

function finishStreaming(messages: ChatMessage[], finalText: string): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (last && last.role === 'tutor' && last.streaming) {
    return [...messages.slice(0, -1), { ...last, text: finalText, streaming: false }]
  }
  return [...messages, { id: id(), role: 'tutor', text: finalText, streaming: false }]
}

function failure(error: unknown): Pick<ChatState, 'error' | 'errorCode' | 'pending'> {
  return {
    error: errorMessage(error),
    errorCode: error instanceof ApiError ? error.code : 'INTERNAL',
    pending: false
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: null,
  level: DEFAULT_LEVEL,
  messages: [],
  notes: [],
  pending: false,
  error: null,
  errorCode: null,

  async start(level = get().level) {
    ensureSubscribed(set)
    set({
      sessionId: null,
      level,
      messages: [],
      notes: [],
      pending: true,
      error: null,
      errorCode: null
    })
    try {
      const { sessionId, greeting } = await call('chat:start', { level })
      set((state) => ({
        sessionId,
        messages: finishStreaming(state.messages, greeting),
        pending: false
      }))
    } catch (error) {
      set({ ...failure(error), messages: [] })
    }
  },

  async send(text) {
    const { sessionId, pending } = get()
    const trimmed = text.trim()
    if (!sessionId || pending || !trimmed) return false
    set((state) => ({
      messages: [...state.messages, { id: id(), role: 'user', text: trimmed, streaming: false }],
      pending: true,
      error: null,
      errorCode: null
    }))
    try {
      const turn = await call('chat:send', { sessionId, text: trimmed })
      const notes: Note[] = []
      for (const e of turn.errors) {
        notes.push({
          id: id(),
          tone: 'amber',
          text: `${e.span} -> ${e.correction}\n${e.explanation}${e.linked ? ' (added back to reviews)' : ''}`
        })
      }
      if (turn.added.length > 0) {
        notes.push({ id: id(), tone: 'green', text: `added to your deck: ${turn.added.join(' ')}` })
      }
      if (turn.analysisFailed) {
        notes.push({ id: id(), tone: 'red', text: 'Could not grade that message this time.' })
      } else if (turn.errors.length === 0 && turn.added.length === 0) {
        notes.push({ id: id(), tone: 'grey', text: 'no corrections, nicely done' })
      }
      if (turn.encouragement) notes.push({ id: id(), tone: 'muted', text: turn.encouragement })
      set((state) => ({
        messages: finishStreaming(state.messages, turn.reply),
        notes: [...state.notes, ...notes],
        pending: false
      }))
      return true
    } catch (error) {
      // Drop the unsent bubble and any partial stream; the caller gives the text back.
      set((state) => ({
        ...failure(error),
        messages: state.messages.filter(
          (m) => !(m.role === 'user' && m.text === trimmed) && !m.streaming
        ),
        notes: [...state.notes, { id: id(), tone: 'red', text: `Error: ${errorMessage(error)}` }]
      }))
      return false
    }
  },

  async changeLevel(level) {
    if (get().pending) return
    await get().start(level)
    set((state) => ({
      notes: [...state.notes, { id: id(), tone: 'grey', text: `Level set to ${level}.` }]
    }))
  },

  reset() {
    set({ sessionId: null, messages: [], notes: [], pending: false, error: null, errorCode: null })
  }
}))
