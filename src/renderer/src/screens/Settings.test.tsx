import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { mockApi, ok, renderScreen } from '../test-utils'

const base = {
  hasKey: false,
  source: null,
  encryptionAvailable: true,
  legacyKeyFile: false,
  dbPath: '/data/mandarin.db'
}
const emptyStats = ok({ words: 0, due: 0, reviews: 0, mistakes: 0 })

describe('Settings: API key', () => {
  it('saves a key after checking it and never shows it back', async () => {
    const user = userEvent.setup()
    const get = vi
      .fn()
      .mockResolvedValueOnce(ok(base))
      .mockResolvedValue(ok({ ...base, hasKey: true, source: 'stored' }))
    const setKey = vi.fn().mockResolvedValue(ok(undefined))
    mockApi({
      'settings:get': get,
      'settings:setKey': setKey,
      'stats:get': vi.fn().mockResolvedValue(emptyStats)
    })

    renderScreen(<Settings />)
    expect(await screen.findByText('No key yet. The chat tutor needs one.')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    const input = screen.getByLabelText('Anthropic API key')
    expect(input).toHaveAttribute('type', 'password')
    await user.type(input, '  sk-ant-example-key-123  ')
    await user.click(save)

    expect(setKey).toHaveBeenCalledWith({ key: 'sk-ant-example-key-123' })
    expect(await screen.findByText('Saved. Chat is ready to use.')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(await screen.findByText('A key is saved on this computer.')).toBeInTheDocument()
    expect(screen.getByText('/data/mandarin.db')).toBeInTheDocument()
  })

  it('shows why a key was rejected and keeps what was typed', async () => {
    const user = userEvent.setup()
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(ok(base)),
      'stats:get': vi.fn().mockResolvedValue(emptyStats),
      'settings:setKey': vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'AUTH', message: 'Anthropic rejected the API key.' }
      })
    })
    renderScreen(<Settings />)
    const input = await screen.findByLabelText('Anthropic API key')
    await user.type(input, 'sk-ant-wrong-key-000')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Anthropic rejected the API key.')).toBeInTheDocument()
    expect(input).toHaveValue('sk-ant-wrong-key-000')
  })

  it('removes a stored key and offers the old Python key file', async () => {
    const user = userEvent.setup()
    const clear = vi.fn().mockResolvedValue(ok(undefined))
    const importKey = vi.fn().mockResolvedValue(ok(undefined))
    mockApi({
      'settings:get': vi
        .fn()
        .mockResolvedValue(ok({ ...base, hasKey: true, source: 'stored', legacyKeyFile: true })),
      'stats:get': vi.fn().mockResolvedValue(emptyStats),
      'settings:clearKey': clear,
      'settings:importLegacyKey': importKey
    })
    renderScreen(<Settings />)
    await user.click(await screen.findByRole('button', { name: 'Remove key' }))
    expect(clear).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Key removed.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import key from the old Python app' }))
    expect(importKey).toHaveBeenCalledWith({ deleteFile: false })
    expect(await screen.findByText('Key imported from the old app.')).toBeInTheDocument()
  })

  it('explains when the key comes from the environment', async () => {
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(ok({ ...base, hasKey: true, source: 'env' })),
      'stats:get': vi.fn().mockResolvedValue(emptyStats)
    })
    renderScreen(<Settings />)
    expect(await screen.findByText(/ANTHROPIC_API_KEY environment variable/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove key' })).not.toBeInTheDocument()
  })
})

describe('Settings: old database', () => {
  it('imports straight away into an empty app', async () => {
    const user = userEvent.setup()
    const legacy = vi
      .fn()
      .mockResolvedValue(ok({ items: 996, reviews: 21, mistakes: 8, backup: null }))
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(ok(base)),
      'stats:get': vi.fn().mockResolvedValue(emptyStats),
      'legacy:import': legacy
    })
    renderScreen(<Settings />)
    const button = await screen.findByRole('button', { name: 'Import my old database' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    expect(legacy).toHaveBeenCalledWith({ replace: false })
    expect(
      await screen.findByText('Imported 996 cards, 21 reviews and 8 mistakes.')
    ).toBeInTheDocument()
  })

  it('asks before replacing existing cards and reports the backup', async () => {
    const user = userEvent.setup()
    const legacy = vi
      .fn()
      .mockResolvedValue(
        ok({ items: 996, reviews: 21, mistakes: 8, backup: '/data/mandarin-before-import.db' })
      )
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(ok(base)),
      'stats:get': vi.fn().mockResolvedValue(ok({ words: 40, due: 40, reviews: 0, mistakes: 0 })),
      'legacy:import': legacy
    })
    renderScreen(<Settings />)
    const button = await screen.findByRole('button', { name: 'Import my old database' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    expect(legacy).not.toHaveBeenCalled()
    expect(screen.getByText(/replaces the 40 cards in this app/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Replace with my old data' }))
    expect(legacy).toHaveBeenCalledWith({ replace: true })
    expect(
      await screen.findByText(/Your previous data was saved to \/data\/mandarin-before-import.db/)
    ).toBeInTheDocument()
  })

  it('says nothing when the file dialog is cancelled', async () => {
    const user = userEvent.setup()
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(ok(base)),
      'stats:get': vi.fn().mockResolvedValue(emptyStats),
      'legacy:import': vi.fn().mockResolvedValue(ok(null))
    })
    renderScreen(<Settings />)
    const button = await screen.findByRole('button', { name: 'Import my old database' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await waitFor(() => expect(button).toBeEnabled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Settings: typing Chinese', () => {
  it('says when a Chinese keyboard is on', async () => {
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(ok(base)),
      'stats:get': vi.fn().mockResolvedValue(emptyStats)
    })
    renderScreen(<Settings />)
    expect(await screen.findByText('A Chinese keyboard is turned on.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Keyboard Settings' })).not.toBeInTheDocument()
  })

  it('shows the Windows steps and opens the system page when none is on', async () => {
    const user = userEvent.setup()
    const openSettings = vi.fn().mockResolvedValue(ok(undefined))
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(ok(base)),
      'stats:get': vi.fn().mockResolvedValue(emptyStats),
      'typing:status': vi.fn().mockResolvedValue(ok({ status: 'missing', platform: 'windows' })),
      'typing:openSettings': openSettings
    })
    renderScreen(<Settings />)
    expect(await screen.findByText('No Chinese keyboard is turned on yet.')).toBeInTheDocument()
    expect(screen.getByText(/Chinese \(Simplified, China\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Language Settings' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
  })
})
