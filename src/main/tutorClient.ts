import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from './settings'
import { AppError } from '@shared/errors'

/** A client for the current key; built per call so a changed key takes effect at once. */
export function createClient(apiKey: string | undefined = getApiKey()): Anthropic {
  if (!apiKey) throw new AppError('NO_API_KEY', 'Add your Anthropic API key in Settings to chat.')
  return new Anthropic({ apiKey })
}

/** Confirm a key works with the cheapest authenticated request. */
export async function verifyApiKey(apiKey: string): Promise<void> {
  try {
    await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 })
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'AUTH') {
      throw new AppError('AUTH', 'Anthropic rejected that key. Check that you copied all of it.')
    }
    throw appError
  }
}

/** Translate SDK failures into codes the renderer can show sensibly. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Anthropic.AuthenticationError) {
    return new AppError('AUTH', 'Anthropic rejected the API key. Check it in Settings.')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AppError('RATE_LIMIT', 'Rate limited by Anthropic. Wait a moment and try again.')
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError('NETWORK', 'Could not reach Anthropic. Check your connection.')
  }
  if (error instanceof Anthropic.APIError) {
    return new AppError('API', `Anthropic error ${error.status ?? ''}: ${error.message}`.trim())
  }
  return new AppError('INTERNAL', error instanceof Error ? error.message : String(error))
}
