import { app, shell, BrowserWindow } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ChatService } from './core/chat'
import { closeDatabase, openDatabase, type Db } from './core/db'
import { Tutor } from './core/tutor'
import { createHandlers } from './handlers'
import { registerHandlers } from './ipc'
import { createClient } from './tutorClient'

// Tests and scratch runs point the app at a throwaway data directory.
if (process.env.MANDARIN_USER_DATA) {
  app.setPath('userData', process.env.MANDARIN_USER_DATA)
}

let db: Db | undefined

function databasePath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'mandarin.db')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 940,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1c1b1f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.jonathanchan.mandarintutor')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const dbPath = databasePath()
  db = openDatabase(dbPath)
  const chat = new ChatService(db, () => new Tutor(createClient()))
  registerHandlers(createHandlers({ db, dbPath, chat }), { validateOutput: !app.isPackaged })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (db) {
    closeDatabase(db)
    db = undefined
  }
})
