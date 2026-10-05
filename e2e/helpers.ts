import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Launched {
  app: ElectronApplication
  page: Page
  /** Throwaway data directory, so tests never touch a real profile. */
  userData: string
}

/**
 * Start the app on an empty data directory with no API key. By default this is
 * the build in out/; set MANDARIN_E2E_EXECUTABLE to test a packaged app instead.
 */
export async function launchApp(): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'mandarin-e2e-'))
  const env = { ...process.env, MANDARIN_USER_DATA: userData, ANTHROPIC_API_KEY: '' } as Record<
    string,
    string
  >
  const executablePath = process.env.MANDARIN_E2E_EXECUTABLE
  const app = await electron.launch(
    executablePath ? { executablePath, env } : { args: ['out/main/index.js'], env }
  )
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, userData }
}

type Bridge = Record<string, (input?: unknown) => Promise<unknown>>

/** Call an IPC channel through the preload bridge, exactly as the UI does. */
export function callBridge(page: Page, channel: string, input?: unknown): Promise<unknown> {
  return page.evaluate(
    ([name, payload]) => (window as unknown as { api: Bridge }).api[name as string](payload),
    [channel, input] as const
  )
}

/** Make the native "open file" dialog return this path instead of appearing. */
export async function answerFileDialogWith(
  app: ElectronApplication,
  filePath: string
): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path]
    })) as typeof dialog.showOpenDialog
  }, filePath)
}

/** A small database in the format the Python version wrote. */
export function buildLegacyDatabase(path: string): void {
  const db = new Database(path)
  db.exec(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL DEFAULT 'vocab', hanzi TEXT NOT NULL,
      pinyin TEXT NOT NULL DEFAULT '', gloss TEXT NOT NULL DEFAULT '', example TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '', extra TEXT NOT NULL DEFAULT '{}', fsrs_card TEXT NOT NULL,
      due TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(hanzi, type));
    CREATE TABLE mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, ts TEXT NOT NULL, source TEXT NOT NULL,
      error_type TEXT NOT NULL DEFAULT 'recall', user_said TEXT NOT NULL DEFAULT '',
      expected TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '');
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, ts TEXT NOT NULL, rating INTEGER NOT NULL);
  `)
  const card = (state: number, due: string): string =>
    JSON.stringify({
      due,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state
    })
  const item = db.prepare(
    'INSERT INTO items (hanzi, pinyin, gloss, fsrs_card, due, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const due = '2026-07-04T23:05:11.120394+00:00'
  item.run('现在', 'xiànzài', 'now', card(0, due), due, due)
  item.run('叫', 'jiào', 'to be called', card(0, due), due, due)
  db.prepare('INSERT INTO reviews (item_id, ts, rating) VALUES (1, ?, 1)').run(
    '2026-07-08T19:03:53.679949+00:00'
  )
  db.prepare(
    "INSERT INTO mistakes (item_id, ts, source, expected) VALUES (1, ?, 'flashcard', '现在 (xiànzài) = now')"
  ).run(new Date().toISOString().replace('Z', '+00:00'))
  db.close()
}
