import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, CHAT_TOKEN_EVENT } from '../shared/channels'

// One invoke function per channel, generated from the shared list so the
// preload can never drift from the contract.
const invokers = Object.fromEntries(
  CHANNELS.map((channel) => [channel, (input?: unknown) => ipcRenderer.invoke(channel, input)])
)

const api = {
  ...invokers,
  onChatToken(listener: (token: unknown) => void): () => void {
    const wrapped = (_event: IpcRendererEvent, token: unknown): void => listener(token)
    ipcRenderer.on(CHAT_TOKEN_EVENT, wrapped)
    return () => {
      ipcRenderer.removeListener(CHAT_TOKEN_EVENT, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
