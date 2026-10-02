import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { QueueItem, RawApi } from '@shared/contract'

/** Install a fake `window.api`; every channel resolves ok unless overridden. */
export function mockApi(overrides: Partial<RawApi>): RawApi {
  const api = {
    onChatToken: vi.fn(() => () => undefined),
    ...overrides
  } as unknown as RawApi
  Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })
  return api
}

export const ok = <T,>(value: T): { ok: true; value: T } => ({ ok: true, value })

export function queueItem(id: number, hanzi: string): QueueItem {
  return {
    id,
    type: 'vocab',
    hanzi,
    pinyin: `pinyin${id}`,
    gloss: `gloss${id}`,
    example: '',
    tags: '',
    extra: {},
    due: 0,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
    created_at: 0,
    intervals: { 1: 60_000, 2: 360_000, 3: 600_000, 4: 691_200_000 }
  }
}

export function renderScreen(ui: React.ReactElement, route = '/'): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}
