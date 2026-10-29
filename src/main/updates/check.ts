// Runs the update check (#442) and turns the stored result into the status the renderer shows.
// One check at a time (a second caller joins the first); automatic checks only with the setting
// `on` and at most once a day; turning the setting off aborts a check in flight.
import { app } from 'electron'
import type { UpdateStatus } from '@shared/ipc'
import { compareSemver } from '@shared/schemas/pack'
import type { AppSettings, UpdateCheckResult } from '@shared/schemas/settings'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { packAppVersion } from '../packs/app-version'
import { getSettings, updateSettings } from '../settings/store'
import { fetchLatestRelease, LATEST_RELEASE_URL, type RateLimitDetails } from './fetch-release'
import { notesFor } from './upgrade-notes'

export const DAY_MS = 24 * 60 * 60 * 1000
/** Check now waits this long after the last check, so a held-down button cannot flood GitHub. */
export const MANUAL_COOLDOWN_MS = 60_000
/** Launches that show the question card before the answer becomes `off`. */
export const MAX_ASKS = 3

/** Replaced in tests. */
export const updateDeps = {
  appVersion: (): string => packAppVersion(),
  platform: (): NodeJS.Platform => process.platform,
  now: (): number => Date.now(),
  fetchImpl: undefined as typeof fetch | undefined,
  /** The releases API, or a loopback test server in unpackaged runs (TTX_UPDATE_URL). */
  url: (): string => {
    const override = process.env.TTX_UPDATE_URL
    return override && !app.isPackaged ? override : LATEST_RELEASE_URL
  },
}

let inFlight: { promise: Promise<UpdateStatus>; controller: AbortController } | undefined

/** The installer file name for this platform, as named in docs/RELEASING.md. */
const INSTALLER_SUFFIX: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '-mac-arm64.dmg',
  win32: '-win-x64-setup.exe',
  linux: '-linux-x86_64.AppImage',
}

function platformAsset(result: UpdateCheckResult | undefined, platform: NodeJS.Platform) {
  const suffix = INSTALLER_SUFFIX[platform]
  if (result?.kind !== 'ok' || !suffix) return undefined
  const names = result.latest.assets.map((a) => a.name)
  const name = names.find((n) => n.endsWith(suffix))
  if (!name) return undefined
  const checksum = names.find((n) => n === `${name}.sha256`)
  return { name, ...(checksum ? { checksum } : {}) }
}

function compare(a: string, b: string): number {
  try {
    return compareSemver(a, b)
  } catch {
    return 0
  }
}

/** What Settings → Updates and the Projects banner show, from the stored settings. */
export function statusOf(settings: AppSettings): UpdateStatus {
  const u = settings.updates
  const installed = updateDeps.appVersion()
  const latest = u.lastResult?.kind === 'ok' ? u.lastResult.latest : undefined
  const order = latest ? compare(latest.version, installed) : 0
  const asset = platformAsset(u.lastResult, updateDeps.platform())
  return {
    installed,
    mode: u.check,
    askedCount: u.askedCount,
    ...(u.lastCheckedAt ? { lastCheckedAt: u.lastCheckedAt } : {}),
    ...(u.lastResult ? { lastResult: u.lastResult } : {}),
    checking: inFlight !== undefined,
    newer: order > 0,
    ahead: !!latest && order < 0,
    dismissed: !!latest && u.dismissedVersion === latest.version,
    notes: latest && order > 0 ? notesFor(installed, latest.version, updateDeps.platform()) : [],
    ...(asset ? { platformAsset: asset } : {}),
  }
}

export async function updateStatus(): Promise<UpdateStatus> {
  return statusOf(await getSettings())
}

function changed(): void {
  emit('updates:changed', {})
}

/**
 * Check for a newer release. `manual` is Check now (the user started the request); `startup`
 * runs only from scheduleStartupCheck. Never throws: failures are stored as the result.
 */
export function checkForUpdate(reason: 'startup' | 'manual'): Promise<UpdateStatus> {
  if (inFlight) return inFlight.promise
  const controller = new AbortController()
  const promise = runCheck(reason, controller.signal).finally(() => {
    inFlight = undefined
    changed()
  })
  inFlight = { promise, controller }
  changed()
  return promise
}

async function runCheck(reason: 'startup' | 'manual', signal: AbortSignal): Promise<UpdateStatus> {
  const before = await getSettings()
  const last = before.updates.lastCheckedAt ? Date.parse(before.updates.lastCheckedAt) : 0
  if (reason === 'manual' && updateDeps.now() - last < MANUAL_COOLDOWN_MS) return statusOf(before)
  const result = await fetchResult(signal)
  if (!result) return updateStatus()
  const saved = await updateSettings((s) => {
    s.updates.lastCheckedAt = new Date(updateDeps.now()).toISOString()
    s.updates.lastResult = result
  })
  return statusOf(saved)
}

/** The check's outcome to store, or undefined when it was stopped (nothing to record). */
async function fetchResult(signal: AbortSignal): Promise<UpdateCheckResult | undefined> {
  try {
    const latest = await fetchLatestRelease({
      url: updateDeps.url(),
      appVersion: updateDeps.appVersion(),
      signal,
      ...(updateDeps.fetchImpl ? { fetchImpl: updateDeps.fetchImpl } : {}),
    })
    return { kind: 'ok', latest }
  } catch (err) {
    if (signal.aborted) return undefined
    const e = err instanceof AppError ? err : new AppError('PROVIDER', 'The check failed')
    const retryAfter = (e.details as RateLimitDetails | undefined)?.retryAfter
    return {
      kind: 'error',
      message: e.message.slice(0, 500),
      ...(retryAfter ? { retryAfter } : {}),
    }
  }
}

/** Stop a check in flight (the setting was turned off). */
export function abortCheck(): void {
  inFlight?.controller.abort()
}

/**
 * At startup: an unanswered question asked on three launches becomes `off`, and with the
 * setting `on` the app checks once if the last check is a day old or more.
 */
export async function scheduleStartupCheck(): Promise<void> {
  const s = await getSettings()
  if (s.updates.check === 'ask' && s.updates.askedCount >= MAX_ASKS) {
    await updateSettings((d) => {
      d.updates.check = 'off'
    })
    return
  }
  if (s.updates.check !== 'on') return
  const last = s.updates.lastCheckedAt ? Date.parse(s.updates.lastCheckedAt) : 0
  if (updateDeps.now() - last < DAY_MS) return
  await checkForUpdate('startup')
}

/** Tests only. */
export function resetUpdateCheck(): void {
  inFlight = undefined
}
