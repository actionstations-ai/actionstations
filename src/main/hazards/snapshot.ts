// Runs the sources the user ticked and assembles one snapshot (spec 0439 FR-6 to FR-13). Each
// source runs on its own: one failure never stops the others. At most 2 requests are in flight.
// A rate-limit answer (429, or a firewall 403) is not retried; that source waits 60 s. The NWS
// alerts endpoint is asked at most once every 30 s, as its documentation recommends.
import type {
  HazardSnapshot,
  HazardSourceId,
  HazardSourceResult,
  ProjectLocation,
} from '@shared/schemas'
import { FIRMS_CREDIT, NWS_CREDIT, OPENFEMA_STATEMENT, USGS_CREDIT } from '@shared/schemas/hazards'
import { AppError, toAppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { redactSecrets } from '../providers/http'
import { HazardHttpError, type HazardGet } from './http'
import { fetchFires, isValidMapKey, maskedFirmsUrl } from './sources/firms'
import { fetchAlerts, fetchForecast, type SourceOutcome } from './sources/nws'
import { fetchDeclarations } from './sources/openfema'
import {
  HISTORICAL_DEFAULTS,
  RECENT_DEFAULTS,
  clampQuery,
  fetchHistorical,
  fetchRecent,
  type QuakeQuery,
} from './sources/usgs'
import { roundTo } from './sources/util'
import { assertRoom, readIndex, saveNewSnapshot } from './store'

export const NETWORK_SOURCES = [
  'nws_alerts',
  'nws_forecast',
  'usgs_recent',
  'usgs_historical',
  'firms',
  'openfema',
] as const satisfies readonly HazardSourceId[]

export const MAX_IN_FLIGHT = 2
export const RETRY_AFTER_MS = 60_000
export const NWS_ALERTS_GAP_MS = 30_000

export interface FetchOptions {
  sources: HazardSourceId[]
  firmsDays: number
  recent: QuakeQuery
  historical: QuakeQuery
}

export const DEFAULT_FETCH_OPTIONS: Omit<FetchOptions, 'sources'> = {
  firmsDays: 3,
  recent: RECENT_DEFAULTS,
  historical: HISTORICAL_DEFAULTS,
}

export interface FetchDeps {
  get: HazardGet
  /** The FIRMS map key, read by the caller from secure storage. */
  firmsKey?: string
  now?: () => Date
  signal?: AbortSignal
}

/** Sources that must wait: source id -> time (ms) before which it is refused. */
const blockedUntil = new Map<HazardSourceId, number>()
let lastAlertsAt = 0

/** Test hook: forget every cool-down. */
export function resetHazardCooldowns(): void {
  blockedUntil.clear()
  lastAlertsAt = 0
}

function attributionOf(id: HazardSourceId, accessedAt: string): string {
  if (id === 'usgs_recent' || id === 'usgs_historical') return USGS_CREDIT
  if (id === 'firms') return FIRMS_CREDIT
  if (id === 'openfema')
    return `${OPENFEMA_STATEMENT} Endpoint: DisasterDeclarationsSummaries v2, accessed ${accessedAt.slice(0, 10)}.`
  return NWS_CREDIT
}

/** Why a source cannot run for this project, or undefined when it can. */
export function skipReason(
  id: HazardSourceId,
  where: ProjectLocation,
  hasKey: boolean,
): string | undefined {
  if ((id === 'nws_alerts' || id === 'nws_forecast') && !where.stateFips)
    return 'Covers the United States only; this location has no state code.'
  if (id === 'openfema' && !where.stateFips)
    return 'Covers the United States only; this location has no state code.'
  if (id === 'firms' && !hasKey) return 'Needs a free FIRMS map key (Settings, Hazard data).'
  return undefined
}

interface Job {
  id: HazardSourceId
  run: () => Promise<SourceOutcome>
}

function jobsFor(
  where: ProjectLocation,
  opts: FetchOptions,
  deps: FetchDeps,
  point: { lat: number; lon: number },
): Job[] {
  const { lat, lon } = point
  const now = deps.now?.() ?? new Date()
  const { get, signal } = deps
  const table: Record<string, () => Promise<SourceOutcome>> = {
    nws_alerts: () => fetchAlerts(get, lat, lon, signal),
    nws_forecast: () => fetchForecast(get, lat, lon, signal),
    usgs_recent: () => fetchRecent(get, lat, lon, clampQuery(opts.recent), now, signal),
    usgs_historical: () => fetchHistorical(get, lat, lon, clampQuery(opts.historical), signal),
    firms: () => fetchFires(get, deps.firmsKey ?? '', lat, lon, opts.firmsDays, signal),
    openfema: () => fetchDeclarations(get, where.stateFips ?? '', where.countyFips, signal),
  }
  return opts.sources.flatMap((id) => (table[id] ? [{ id, run: table[id]! }] : []))
}

/** The cool-down message for a source that must wait, or undefined. */
function waitMessage(id: HazardSourceId, nowMs: number): string | undefined {
  const until = blockedUntil.get(id) ?? 0
  if (until > nowMs)
    return `Wait ${Math.ceil((until - nowMs) / 1000)} s before trying this source again.`
  if (id === 'nws_alerts' && lastAlertsAt + NWS_ALERTS_GAP_MS > nowMs)
    return 'The weather service asks for at most one alerts request every 30 seconds. Try again shortly.'
  return undefined
}

function failure(
  id: HazardSourceId,
  err: unknown,
  secret: string | undefined,
  nowMs: number,
): Pick<HazardSourceResult, 'status' | 'error' | 'httpStatus'> {
  const httpStatus =
    err instanceof HazardHttpError
      ? err.httpStatus
      : ((err as { httpStatus?: number } | undefined)?.httpStatus ?? undefined)
  if (httpStatus === 429 || httpStatus === 403) blockedUntil.set(id, nowMs + RETRY_AFTER_MS)
  const message = redactSecrets(toAppError(err).message, secret).slice(0, 300)
  const hint =
    httpStatus === 429 || httpStatus === 403 ? ' Not retried; try again after a minute.' : ''
  return {
    status: 'error',
    error: `${message}${hint}`.slice(0, 300),
    ...(httpStatus ? { httpStatus } : {}),
  }
}

async function runJob(
  job: Job,
  where: ProjectLocation,
  opts: FetchOptions,
  deps: FetchDeps,
  point: { lat: number; lon: number },
): Promise<{ result: HazardSourceResult; patch?: Partial<HazardSnapshot> }> {
  const nowMs = (deps.now?.() ?? new Date()).getTime()
  const accessedAt = new Date(nowMs).toISOString()
  const attribution = attributionOf(job.id, accessedAt)
  const base = { id: job.id, attribution, accessedAt }
  const skip = skipReason(job.id, where, !!deps.firmsKey) ?? waitMessage(job.id, nowMs)
  if (skip) return { result: { ...base, status: 'skipped', error: skip } }
  if (job.id === 'nws_alerts') lastAlertsAt = nowMs
  try {
    const out = await job.run()
    return {
      result: { ...base, url: out.url.slice(0, 1000), status: out.count > 0 ? 'ok' : 'empty' },
      patch: out.patch,
    }
  } catch (err) {
    if (toAppError(err).code === 'CANCELLED') throw err
    const url =
      job.id === 'firms' ? maskedFirmsUrl(point.lat, point.lon, opts.firmsDays) : undefined
    return {
      result: { ...base, ...(url ? { url } : {}), ...failure(job.id, err, deps.firmsKey, nowMs) },
    }
  }
}

/** Run `jobs` with at most MAX_IN_FLIGHT at a time, keeping their order in the result. */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const at = next++
      out[at] = await fn(items[at]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return out
}

function merge(snapshot: HazardSnapshot, patch: Partial<HazardSnapshot>): void {
  if (patch.alerts) snapshot.alerts = patch.alerts
  if (patch.forecast) snapshot.forecast = patch.forecast
  if (patch.declarations) snapshot.declarations = patch.declarations
  if (patch.fires) snapshot.fires = patch.fires
  if (patch.earthquakes?.recent.length) snapshot.earthquakes.recent = patch.earthquakes.recent
  if (patch.earthquakes?.historical.length)
    snapshot.earthquakes.historical = patch.earthquakes.historical
}

/** The values that leave the computer: the location rounded to the project's precision. */
export function roundedPoint(where: ProjectLocation): { lat: number; lon: number } {
  return {
    lat: roundTo(where.lat, where.sendPrecision),
    lon: roundTo(where.lon, where.sendPrecision),
  }
}

/** Fetch the chosen sources, write the snapshot to the project, and return it. */
export async function fetchSnapshot(
  root: string,
  where: ProjectLocation,
  opts: FetchOptions,
  deps: FetchDeps,
): Promise<HazardSnapshot> {
  if (!opts.sources.length) throw new AppError('VALIDATION', 'Choose at least one source')
  if (deps.firmsKey !== undefined && !isValidMapKey(deps.firmsKey)) delete deps.firmsKey
  assertRoom(await readIndex(root))
  const point = roundedPoint(where)
  const jobs = jobsFor(where, opts, deps, point)
  const done = await pool(jobs, MAX_IN_FLIGHT, (j) => runJob(j, where, opts, deps, point))
  const snapshot: HazardSnapshot = {
    id: newId(),
    label: '',
    pinned: false,
    fetchedAt: nowIso(),
    request: {
      ...point,
      precision: where.sendPrecision,
      ...(where.stateFips ? { stateFips: where.stateFips } : {}),
      ...(where.countyFips ? { countyFips: where.countyFips } : {}),
    },
    sources: done.map((d) => d.result),
    alerts: [],
    forecast: [],
    earthquakes: { recent: [], historical: [] },
    declarations: [],
    infrastructure: [],
  }
  for (const d of done) if (d.patch) merge(snapshot, d.patch)
  assertNoKey(snapshot, deps.firmsKey)
  await saveNewSnapshot(root, snapshot)
  return snapshot
}

/** Defence in depth: a map key must never reach a file. */
function assertNoKey(snapshot: HazardSnapshot, key: string | undefined): void {
  if (key && JSON.stringify(snapshot).includes(key))
    throw new AppError('INTERNAL', 'Refused to save a snapshot that contains a map key')
}
