/**
 * Remembered self-hosted servers (spec 0410 FR-2): addresses, names and pinned fingerprints in
 * settings; the server key only in the OS-encrypted secret store, so `hasKey` is all the renderer
 * ever learns about it.
 */
import { MAX_REMEMBERED_SERVERS } from '@shared/live/servers'
import type { LiveServerEntry } from '@shared/schemas/settings'
import { AppError } from '../lib/errors'
import { getSettings, updateSettings } from '../settings/store'
import { normalizeServerUrl } from './transport/remote'
import { hasServerKey, setServerKey } from './transport/self-hosted-client'

export type ServerListing = LiveServerEntry & { hasKey: boolean }

const keyOf = (url: string): string => normalizeServerUrl(url, true)

export async function listServers(): Promise<ServerListing[]> {
  const { live } = await getSettings()
  return Promise.all(live.servers.map(async (s) => ({ ...s, hasKey: await hasServerKey(s.url) })))
}

export interface SaveServerRequest {
  url: string
  name?: string | undefined
  fingerprintSha256?: string | undefined
  serverKey?: string | undefined
}

/** Add or update one server. The key is stored first, so a refused key leaves settings alone. */
export async function saveServer(req: SaveServerRequest): Promise<ServerListing> {
  const url = keyOf(req.url)
  if (req.serverKey) await setServerKey(url, req.serverKey)
  const settings = await updateSettings((s) => {
    const existing = s.live.servers.find((e) => keyOf(e.url) === url)
    if (!existing && s.live.servers.length >= MAX_REMEMBERED_SERVERS) {
      throw new AppError(
        'VALIDATION',
        `You can remember up to ${MAX_REMEMBERED_SERVERS} servers. Forget one first.`,
      )
    }
    const entry: LiveServerEntry = {
      ...existing,
      url,
      addedAt: existing?.addedAt ?? new Date().toISOString(),
      ...(req.name !== undefined ? { name: req.name || undefined } : {}),
      ...(req.fingerprintSha256 ? { fingerprintSha256: req.fingerprintSha256 } : {}),
    }
    s.live.servers = [...s.live.servers.filter((e) => keyOf(e.url) !== url), entry]
  })
  const saved = settings.live.servers.find((e) => keyOf(e.url) === url)!
  return { ...saved, hasKey: await hasServerKey(url) }
}

export async function forgetServer(rawUrl: string): Promise<void> {
  const url = keyOf(rawUrl)
  await setServerKey(url, null)
  await updateSettings((s) => {
    s.live.servers = s.live.servers.filter((e) => keyOf(e.url) !== url)
  })
}

/** Note when a remembered server was last tested and why it failed; other addresses are ignored. */
export async function recordServerTest(rawUrl: string, error?: string): Promise<void> {
  let url: string
  try {
    url = keyOf(rawUrl)
  } catch {
    return
  }
  const known = (await getSettings()).live.servers.some((e) => keyOf(e.url) === url)
  if (!known) return
  await updateSettings((s) => {
    for (const e of s.live.servers) {
      if (keyOf(e.url) !== url) continue
      e.lastTestedAt = new Date().toISOString()
      if (error) e.lastError = error.slice(0, 500)
      else delete e.lastError
    }
  })
}
