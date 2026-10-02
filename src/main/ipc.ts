import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { z } from 'zod'
import { CHANNELS } from '@shared/channels'
import { contract, type Channel, type Output, type Parsed, type Result } from '@shared/contract'
import { AppError, type ErrorCode } from '@shared/errors'

export interface HandlerContext {
  sender: WebContents
}

export type Handler<K extends Channel> = (
  input: Parsed<K>,
  ctx: HandlerContext
) => Output<K> | Promise<Output<K>>

/** One implementation per channel; leaving one out is a compile error. */
export type Handlers = { [K in Channel]: Handler<K> }

export function toResultError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  if (error instanceof z.ZodError) return { code: 'VALIDATION', message: z.prettifyError(error) }
  return { code: 'INTERNAL', message: error instanceof Error ? error.message : String(error) }
}

export interface InvokeOptions {
  /** Check handler results against the contract (on in development). */
  validateOutput?: boolean
  log?: Pick<Console, 'error' | 'warn'>
}

/** Validate the payload, run the handler, wrap the outcome in a Result. */
export async function invoke<K extends Channel>(
  channel: K,
  handlers: Handlers,
  raw: unknown,
  ctx: HandlerContext,
  options: InvokeOptions = {}
): Promise<Result<Output<K>>> {
  const log = options.log ?? console
  const parsed = contract[channel].input.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION', message: z.prettifyError(parsed.error) } }
  }
  try {
    const handler = handlers[channel] as Handler<K>
    const value = (await handler(parsed.data as Parsed<K>, ctx)) as Output<K>
    if (options.validateOutput) {
      const check = contract[channel].output.safeParse(value)
      if (!check.success)
        log.warn(
          `[ipc] ${channel} returned an off-contract value:\n${z.prettifyError(check.error)}`
        )
    }
    return { ok: true, value }
  } catch (error) {
    log.error(`[ipc] ${channel} failed:`, error)
    return { ok: false, error: toResultError(error) }
  }
}

export function registerHandlers(
  handlers: Handlers,
  options: InvokeOptions = {},
  ipc: Pick<typeof ipcMain, 'handle'> = ipcMain
): void {
  for (const channel of CHANNELS) {
    ipc.handle(channel, (event: IpcMainInvokeEvent, raw: unknown) =>
      invoke(channel, handlers, raw, { sender: event.sender }, options)
    )
  }
}
