import type { Args, Channel, ChatToken, Output } from '@shared/contract'
import type { ErrorCode } from '@shared/errors'

/** Thrown by `call` when the main process returned an error envelope. */
export class ApiError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** Call a channel on the main process and unwrap its Result envelope. */
export async function call<K extends Channel>(channel: K, ...args: Args<K>): Promise<Output<K>> {
  const method = window.api[channel] as (
    ...a: Args<K>
  ) => Promise<
    { ok: true; value: Output<K> } | { ok: false; error: { code: ErrorCode; message: string } }
  >
  const result = await method(...args)
  if (!result.ok) throw new ApiError(result.error.code, result.error.message)
  return result.value
}

export function onChatToken(listener: (token: ChatToken) => void): () => void {
  return window.api.onChatToken(listener)
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}
