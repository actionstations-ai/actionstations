// The connector registry (spec 0448 FR-8, ADR-0076). A connector finds and fetches a real past
// event from one public archive. Connectors are app code, one file each in this folder; toolkits
// (packs) name them by id and cannot supply code or addresses. `estimate()` is pure: it gets the
// query and nothing else, so the size shown to the user costs no network call. `fetch()` gets a
// `get` limited to the connector's own fixed hosts, and runs only after the user consented.
import { z } from 'zod'
import type { CaseDataset, CaseDatasetKind } from '@shared/schemas/case-data'
import { CaseArea, CaseTimeRange } from '@shared/schemas/case-data'
import { isLoopbackHost, isPrivateNetworkHost } from '@shared/provider-network'
import { AppError } from '../../lib/errors'

/** What the user asked for: a period, a place and any connector-specific options. */
export const ConnectorQuery = z.object({
  range: CaseTimeRange,
  area: CaseArea,
  options: z
    .record(z.string().max(60), z.union([z.string().max(200), z.number(), z.boolean()]))
    .default({}),
})
export type ConnectorQuery = z.infer<typeof ConnectorQuery>

export interface EstimateItem {
  datasetId: string
  label: string
  kind: CaseDatasetKind
  bytes: number
}

export interface ConnectorEstimate {
  items: EstimateItem[]
  /** How many requests fetch() expects to make. */
  requests: number
}

export interface ConnectorResponse {
  status: number
  data: Uint8Array
}

export interface FetchContext {
  /** GET one URL on one of the connector's hosts. Bytes count against the scenario's room. */
  get: (url: string) => Promise<ConnectorResponse>
  signal?: AbortSignal
}

export interface FetchedFile {
  name: string
  data: Uint8Array | string
}

export interface ConnectorResult {
  /** Provenance is completed by the framework: origin historical, retrieval date, terms. */
  datasets: Omit<CaseDataset, 'provenance' | 'bytes'>[]
  files: FetchedFile[]
  /** What was done to the data (a crop, a resample); shown wherever it appears. */
  modified?: string
  citation?: string
}

export interface Connector {
  /** Lowercase id a toolkit names, e.g. "nws-storm-reports". */
  id: string
  label: string
  /** The archive, as shown to the user and kept in provenance. */
  source: string
  terms: string
  /** Fixed https hosts this connector may call. Never taken from pack data or the renderer. */
  hosts: readonly string[]
  estimate(query: ConnectorQuery): ConnectorEstimate
  fetch(query: ConnectorQuery, ctx: FetchContext): Promise<ConnectorResult>
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

const registry = new Map<string, Connector>()

function checkHosts(c: Connector): void {
  if (!c.hosts.length) throw new AppError('VALIDATION', `Connector ${c.id} names no host`)
  for (const h of c.hosts) {
    const bare = !HOST.test(h) || /^\d+(\.\d+){3}$/.test(h)
    if (bare || isLoopbackHost(h) || isPrivateNetworkHost(h))
      throw new AppError('VALIDATION', `Connector ${c.id}: ${h} is not a public host name`)
  }
}

export function registerConnector(c: Connector): void {
  if (!ID.test(c.id)) throw new AppError('VALIDATION', `Invalid connector id: ${c.id}`)
  if (registry.has(c.id)) throw new AppError('CONFLICT', `Connector ${c.id} is already registered`)
  checkHosts(c)
  registry.set(c.id, Object.freeze({ ...c, hosts: Object.freeze([...c.hosts]) }))
}

export function getConnector(id: string): Connector {
  const c = registry.get(id)
  if (!c) throw new AppError('NOT_FOUND', `No connector named ${id}`)
  return c
}

export const hasConnector = (id: string): boolean => registry.has(id)

/** Ids a toolkit may name. */
export const connectorIds = (): string[] => [...registry.keys()].sort()

export const listConnectors = (): Pick<
  Connector,
  'id' | 'label' | 'source' | 'terms' | 'hosts'
>[] =>
  [...registry.values()]
    .map(({ id, label, source, terms, hosts }) => ({ id, label, source, terms, hosts }))
    .sort((a, b) => a.id.localeCompare(b.id))

/** Test hook: forget every registered connector. */
export function clearConnectors(): void {
  registry.clear()
}
