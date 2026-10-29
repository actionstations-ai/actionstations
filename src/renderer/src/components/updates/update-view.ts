// Text for the update check (#442): the banner, the Settings result line and times. Pure.
import type { UpdateStatus } from '@shared/ipc'
import type { LatestRelease } from '@shared/schemas/settings'

/** Check now stays disabled this long after a check finishes (main enforces it too). */
export const CHECK_COOLDOWN_MS = 60_000

/** What the check sends, for the wizard, the question card and Settings. */
export const WHAT_IS_SENT =
  'It sends one request to api.github.com with the app’s name and version. GitHub sees your IP address. Nothing about you or your projects is sent.'

export function latestOf(status: UpdateStatus | undefined): LatestRelease | undefined {
  return status?.lastResult?.kind === 'ok' ? status.lastResult.latest : undefined
}

export function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'long' })
}

export function bannerTitle(status: UpdateStatus): string {
  const latest = latestOf(status)
  return latest
    ? `Action Stations ${latest.version} is available (you have ${status.installed})`
    : ''
}

/** The one-line result in Settings → Updates. */
export function resultText(status: UpdateStatus): string {
  if (status.checking) return 'Checking for a new version…'
  const r = status.lastResult
  if (!r) return 'Not checked yet.'
  if (r.kind === 'error') {
    const time = r.retryAfter
      ? new Date(r.retryAfter).toLocaleTimeString(undefined, { timeStyle: 'short' })
      : undefined
    return time ? `${r.message}. Try again after ${time}.` : `The last check failed: ${r.message}.`
  }
  if (status.newer) return `${bannerTitle(status)}.`
  if (status.ahead) return `You are ahead of the latest release (${r.latest.version}).`
  return 'You have the latest release.'
}

/** Milliseconds until Check now may run again; 0 when it may run now. */
export function cooldownLeft(lastCheckedAt: string | undefined, now: number): number {
  if (!lastCheckedAt) return 0
  const t = Date.parse(lastCheckedAt)
  return Number.isNaN(t) ? 0 : Math.max(0, t + CHECK_COOLDOWN_MS - now)
}
