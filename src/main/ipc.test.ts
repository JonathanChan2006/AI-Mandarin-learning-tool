import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type { ChatService } from './core/chat'
import { openDatabase } from './core/db'
import { createHandlers } from './handlers'
import { invoke, registerHandlers, toResultError } from './ipc'
import { CHANNELS } from '@shared/channels'
import { AppError } from '@shared/errors'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const ctx = { sender: {} as WebContents }
const deps = (): Parameters<typeof createHandlers>[0] => ({
  db: openDatabase(':memory:'),
  dbPath: ':memory:',
  chat: {} as ChatService
})
const quiet = { error: vi.fn(), warn: vi.fn() }

describe('invoke', () => {
  it('returns ok envelopes with the handler value', async () => {
    const handlers = createHandlers(deps())
    const result = await invoke('stats:get', handlers, undefined, ctx, { log: quiet })
    expect(result).toEqual({ ok: true, value: { words: 0, due: 0, reviews: 0, mistakes: 0 } })
  })

  it('applies input defaults before calling the handler', async () => {
    const handlers = createHandlers(deps())
    const spy = vi.fn().mockReturnValue([])
    handlers['weak:list'] = spy
    await invoke('weak:list', handlers, {}, ctx, { log: quiet })
    expect(spy).toHaveBeenCalledWith({ limit: 50 }, ctx)
  })

  it('rejects bad payloads with VALIDATION', async () => {
    const handlers = createHandlers(deps())
    const result = await invoke('review:grade', handlers, { itemId: 'x' }, ctx, { log: quiet })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION')
  })

  it('maps thrown AppErrors to their code and other errors to INTERNAL', async () => {
    const handlers = createHandlers(deps())
    const notFound = await invoke('review:grade', handlers, { itemId: 42, rating: 3 }, ctx, {
      log: quiet
    })
    expect(notFound).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No card with id 42' }
    })

    handlers['stats:get'] = () => {
      throw new Error('boom')
    }
    const internal = await invoke('stats:get', handlers, undefined, ctx, { log: quiet })
    expect(internal).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'boom' } })
  })

  it('warns when a handler result is off contract', async () => {
    const handlers = createHandlers(deps())
    handlers['stats:get'] = () => ({ words: 'many' }) as never
    const log = { error: vi.fn(), warn: vi.fn() }
    await invoke('stats:get', handlers, undefined, ctx, { validateOutput: true, log })
    expect(log.warn).toHaveBeenCalledTimes(1)
  })
})

describe('registerHandlers', () => {
  it('registers one handler per channel', () => {
    const handle = vi.fn()
    registerHandlers(createHandlers(deps()), {}, { handle })
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual([...CHANNELS].sort())
  })
})

describe('toResultError', () => {
  it('keeps AppError codes', () => {
    expect(toResultError(new AppError('AUTH', 'bad key'))).toEqual({
      code: 'AUTH',
      message: 'bad key'
    })
    expect(toResultError('oops')).toEqual({ code: 'INTERNAL', message: 'oops' })
  })
})
