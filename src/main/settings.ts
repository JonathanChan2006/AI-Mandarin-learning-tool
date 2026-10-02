import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { AppError } from '@shared/errors'

/**
 * The Anthropic API key, encrypted with the OS keychain (Electron safeStorage)
 * and kept in the app's data directory. ANTHROPIC_API_KEY in the environment
 * wins over the stored key. The key never leaves the main process.
 */

interface Secrets {
  /** base64 of safeStorage.encryptString(key) */
  apiKey?: string
}

export type KeySource = 'env' | 'stored'

export function secretsPath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

/** Where the Python version kept its plaintext key. */
export function legacyKeyPath(): string {
  return join(homedir(), '.mandarin_tutor.json')
}

function readSecrets(): Secrets {
  try {
    const parsed: unknown = JSON.parse(readFileSync(secretsPath(), 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Secrets) : {}
  } catch {
    return {}
  }
}

function writeSecrets(secrets: Secrets): void {
  const path = secretsPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(secrets), { encoding: 'utf8', mode: 0o600 })
}

function envKey(): string | undefined {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  return key ? key : undefined
}

export function getStoredApiKey(): string | undefined {
  const { apiKey } = readSecrets()
  if (!apiKey || !safeStorage.isEncryptionAvailable()) return undefined
  try {
    const key = safeStorage.decryptString(Buffer.from(apiKey, 'base64'))
    return key ? key : undefined
  } catch {
    // Encrypted by another install or a different keychain: treat as unset.
    return undefined
  }
}

export function getApiKey(): string | undefined {
  return envKey() ?? getStoredApiKey()
}

export function keySource(): KeySource | null {
  if (envKey()) return 'env'
  if (getStoredApiKey()) return 'stored'
  return null
}

export function setApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError(
      'ENCRYPTION_UNAVAILABLE',
      'This system cannot encrypt the key. Set ANTHROPIC_API_KEY in your environment instead.'
    )
  }
  const encrypted = safeStorage.encryptString(key.trim()).toString('base64')
  writeSecrets({ ...readSecrets(), apiKey: encrypted })
}

export function clearApiKey(): void {
  const secrets = readSecrets()
  delete secrets.apiKey
  writeSecrets(secrets)
}

export function legacyKeyFileExists(): boolean {
  return existsSync(legacyKeyPath())
}

/** Move the key out of the Python app's plaintext file. */
export function importLegacyKey(deleteFile: boolean): void {
  let key: string | undefined
  try {
    const parsed: unknown = JSON.parse(readFileSync(legacyKeyPath(), 'utf8'))
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { api_key?: unknown }).api_key === 'string'
    ) {
      key = (parsed as { api_key: string }).api_key.trim()
    }
  } catch {
    key = undefined
  }
  if (!key) throw new AppError('NOT_FOUND', `No API key found in ${legacyKeyPath()}.`)
  setApiKey(key)
  if (deleteFile) unlinkSync(legacyKeyPath())
}

export interface SettingsSnapshot {
  hasKey: boolean
  source: KeySource | null
  encryptionAvailable: boolean
  legacyKeyFile: boolean
  dbPath: string
}

export function getSettings(dbPath: string): SettingsSnapshot {
  const source = keySource()
  return {
    hasKey: source !== null,
    source,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    legacyKeyFile: legacyKeyFileExists(),
    dbPath
  }
}
