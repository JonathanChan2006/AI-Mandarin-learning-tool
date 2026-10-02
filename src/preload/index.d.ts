import type { RawApi } from '../shared/contract'

declare global {
  interface Window {
    api: RawApi
  }
}

export {}
