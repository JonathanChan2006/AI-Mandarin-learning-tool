import { dirname, join, resolve } from 'path'
import type { WebContents } from 'electron'
import type { ChatService } from './core/chat'
import type { Db } from './core/db'
import { importLegacyDb } from './core/legacy'
import { addItem, dueItems, nextDueAt, stats } from './core/items'
import { listMistakes, weakItems } from './core/mistakes'
import { gradeItem } from './core/review'
import { previewIntervals } from './core/scheduler'
import { loadSeed } from './core/seed'
import { knownWords } from './core/vocab'
import type { Handlers } from './ipc'
import * as settings from './settings'
import { toAppError, verifyApiKey } from './tutorClient'
import { CHAT_TOKEN_EVENT } from '@shared/channels'
import { AppError } from '@shared/errors'

export interface FilePickOptions {
  title: string
  /** Label for the file type, e.g. "SQLite database". */
  name: string
  extensions: string[]
}

/** Shows a native open-file dialog; resolves null when the user cancels. */
export type PickFile = (options: FilePickOptions, sender: WebContents) => Promise<string | null>

export interface TypingSupport {
  info(): Promise<{
    status: 'enabled' | 'missing' | 'unknown'
    platform: 'mac' | 'windows' | 'other'
  }>
  openSettings(): Promise<void>
}

export interface HandlerDeps {
  db: Db
  dbPath: string
  chat: ChatService
  pickFile: PickFile
  typing: TypingSupport
}

function backupName(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*/, '')
  return `mandarin-before-import-${stamp}.db`
}

const notYet = (): never => {
  throw new AppError('INTERNAL', 'Not implemented yet')
}

export function createHandlers({ db, dbPath, chat, pickFile, typing }: HandlerDeps): Handlers {
  return {
    'stats:get': () => stats(db),

    'review:queue': () => {
      const now = new Date()
      const items = dueItems(db, now).map((item) => ({
        ...item,
        intervals: previewIntervals(item, now)
      }))
      return { items, nextDueAt: nextDueAt(db, now) }
    },

    'review:grade': ({ itemId, rating }) => gradeItem(db, itemId, rating),

    'weak:list': ({ limit }) => weakItems(db, new Date(), limit),

    'mistakes:list': ({ limit, offset }) => listMistakes(db, limit, offset),

    'items:add': (input) => ({ id: addItem(db, input) }),

    'seed:load': () => loadSeed(db),

    'vocab:known': () => knownWords(db),

    'chat:start': async ({ level }, { sender }) => {
      try {
        return await chat.start(level, (token) => sender.send(CHAT_TOKEN_EVENT, token))
      } catch (error) {
        throw toAppError(error)
      }
    },

    'chat:send': async ({ sessionId, text }, { sender }) => {
      try {
        return await chat.send(sessionId, text, (token) => sender.send(CHAT_TOKEN_EVENT, token))
      } catch (error) {
        throw toAppError(error)
      }
    },

    'import:pick': notYet,
    'import:preview': notYet,
    'import:commit': notYet,

    'settings:get': () => settings.getSettings(dbPath),

    'settings:setKey': async ({ key }) => {
      await verifyApiKey(key)
      settings.setApiKey(key)
    },

    'settings:clearKey': () => settings.clearApiKey(),

    'settings:importLegacyKey': ({ deleteFile }) => settings.importLegacyKey(deleteFile),

    'legacy:import': async ({ replace }, { sender }) => {
      const path = await pickFile(
        { title: 'Choose the old mandarin.db', name: 'SQLite database', extensions: ['db'] },
        sender
      )
      if (!path) return null
      if (resolve(path) === resolve(dbPath)) {
        throw new AppError(
          'VALIDATION',
          "That is this app's own database. Pick the one from the Python version."
        )
      }
      const backupPath = join(dirname(dbPath), backupName(new Date()))
      return importLegacyDb(db, path, { replace, backupPath })
    },

    'typing:status': () => typing.info(),

    'typing:openSettings': () => typing.openSettings()
  }
}
