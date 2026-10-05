import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ dir: '', encryption: true }))

vi.mock('electron', () => ({
  app: { getPath: () => state.dir },
  safeStorage: {
    isEncryptionAvailable: () => state.encryption,
    encryptString: (text: string) => Buffer.from(`enc:${text}`),
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString()
      if (!text.startsWith('enc:')) throw new Error('bad ciphertext')
      return text.slice(4)
    }
  }
}))

import * as settings from './settings'

describe('settings', () => {
  beforeEach(() => {
    state.dir = mkdtempSync(join(tmpdir(), 'mandarin-settings-'))
    state.encryption = true
    delete process.env.ANTHROPIC_API_KEY
  })
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('round-trips an encrypted key and never stores it in the clear', () => {
    settings.setApiKey('  sk-ant-test-key  ')
    expect(settings.getApiKey()).toBe('sk-ant-test-key')
    expect(settings.keySource()).toBe('stored')
    const raw = readFileSync(join(state.dir, 'secrets.json'), 'utf8')
    expect(raw).not.toContain('sk-ant-test-key')
    settings.clearApiKey()
    expect(settings.getApiKey()).toBeUndefined()
    expect(settings.keySource()).toBeNull()
  })

  it('prefers the environment variable', () => {
    settings.setApiKey('stored-key')
    process.env.ANTHROPIC_API_KEY = 'env-key'
    expect(settings.getApiKey()).toBe('env-key')
    expect(settings.keySource()).toBe('env')
  })

  it('refuses to store when encryption is unavailable', () => {
    state.encryption = false
    expect(() => settings.setApiKey('k')).toThrowError(/encrypt/)
    expect(settings.getSettings('/tmp/x.db').encryptionAvailable).toBe(false)
  })

  it('treats unreadable or foreign ciphertext as no key', () => {
    writeFileSync(
      join(state.dir, 'secrets.json'),
      JSON.stringify({ apiKey: Buffer.from('zzz').toString('base64') })
    )
    expect(settings.getApiKey()).toBeUndefined()
    writeFileSync(join(state.dir, 'secrets.json'), 'not json')
    expect(settings.getApiKey()).toBeUndefined()
  })

  it('reports status without exposing the key', () => {
    settings.setApiKey('secret-value')
    const snapshot = settings.getSettings('/data/mandarin.db')
    expect(snapshot).toMatchObject({ hasKey: true, source: 'stored', dbPath: '/data/mandarin.db' })
    expect(JSON.stringify(snapshot)).not.toContain('secret-value')
  })

  it('imports the key from the old Python file and only deletes it when asked', () => {
    const legacy = join(state.dir, 'old-python-key.json')
    writeFileSync(legacy, JSON.stringify({ api_key: '  old-python-key  ' }))
    expect(settings.legacyKeyFileExists(legacy)).toBe(true)

    settings.importLegacyKey(false, legacy)
    expect(settings.getApiKey()).toBe('old-python-key')
    expect(existsSync(legacy)).toBe(true)

    settings.importLegacyKey(true, legacy)
    expect(existsSync(legacy)).toBe(false)
    expect(settings.legacyKeyFileExists(legacy)).toBe(false)
  })

  it('refuses an old file with no key in it', () => {
    const legacy = join(state.dir, 'old-python-key.json')
    writeFileSync(legacy, JSON.stringify({ something: 'else' }))
    expect(() => settings.importLegacyKey(true, legacy)).toThrowError(/No API key found/)
    expect(existsSync(legacy)).toBe(true)
    expect(() => settings.importLegacyKey(false, join(state.dir, 'missing.json'))).toThrowError(
      /No API key found/
    )
  })
})
