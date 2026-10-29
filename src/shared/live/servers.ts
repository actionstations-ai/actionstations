/**
 * The one relay address and what the app knows about the player page it ships (spec 0410). The
 * address is a constant the facilitator can read on screen; nothing connects to it until a
 * session is tested or started on a connection the facilitator chose.
 */
export const RELAY_URL = 'https://relay.actionstations.ai'
export const RELAY_HOST = 'relay.actionstations.ai'

declare const __RELAY_PLAYER_BUNDLE_SHA256__: string | undefined

/**
 * SHA-256 of the player bundle shipped with this app, injected by electron.vite.config.ts from
 * out/player when the app is built. Empty means "not set in this build" (dev, unit tests): the
 * test then reports the relay's hash without judging it.
 */
export const RELAY_PLAYER_BUNDLE_SHA256: string =
  typeof __RELAY_PLAYER_BUNDLE_SHA256__ === 'string' ? __RELAY_PLAYER_BUNDLE_SHA256__ : ''

/** Server keys live in secrets under this name, one per server address. */
export const SERVER_KEY_PREFIX = 'live-server-'

export const MAX_REMEMBERED_SERVERS = 20
