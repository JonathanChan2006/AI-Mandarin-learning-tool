/**
 * IPC channel names. Kept free of zod so the sandboxed preload can import it
 * without pulling the whole contract into its bundle.
 */
export const CHANNELS = [
  'stats:get',
  'review:queue',
  'review:grade',
  'weak:list',
  'mistakes:list',
  'items:add',
  'seed:load',
  'vocab:known',
  'chat:start',
  'chat:send',
  'import:pick',
  'import:preview',
  'import:commit',
  'settings:get',
  'settings:setKey',
  'settings:clearKey',
  'settings:importLegacyKey',
  'legacy:import'
] as const

export type Channel = (typeof CHANNELS)[number]

/** Main -> renderer event carrying one streamed chunk of a tutor reply. */
export const CHAT_TOKEN_EVENT = 'chat:token'
