// Fetching a real past event once, with consent (spec 0448 FR-8, NFR-2, NFR-4, NFR-5).
// Step 1, `planFetch`: the connector's pure estimate, the room left under the scenario's limit
// and a one-time estimate id. No network. Step 2, `runFetch`: needs that id and `consent: true`,
// refuses first if the estimate does not fit, then calls the connector with a `get` limited to
// its fixed hosts. Files land only inside the scenario's case folder. Every request and the
// outcome go to case/fetch-log.jsonl.
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { CaseDataset, type CaseManifest, type CaseProvenance } from '@shared/schemas/case-data'
import { formatBytes, redact } from '../packs/fetch'
import { AppError } from '../lib/errors'
import { ensureDir } from '../lib/fs'
import {
  ConnectorQuery,
  getConnector,
  type Connector,
  type ConnectorEstimate,
  type ConnectorResult,
} from '../toolkits/connectors/registry'
import { createCaseGet } from './http'
import { addDatasets, fetchLogFile, roomLeft } from './store'

export interface FetchPlan {
  estimateId: string
  connectorId: string
  source: string
  terms: string
  hosts: readonly string[]
  estimate: ConnectorEstimate
  totalBytes: number
  roomBytes: number
  /** True when the estimate is larger than the room left: the fetch will be refused. */
  exceedsLimit: boolean
}

interface Pending {
  root: string
  scenarioId: string
  connectorId: string
  query: ConnectorQuery
  totalBytes: number
  expires: number
}

const PENDING_MS = 10 * 60_000
const pending = new Map<string, Pending>()

export interface AcquireDeps {
  maxMbPerScenario: number
  version: string
  now?: () => Date
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

const totalOf = (e: ConnectorEstimate): number => e.items.reduce((n, i) => n + i.bytes, 0)

export async function planFetch(
  root: string,
  scenarioId: string,
  connectorId: string,
  rawQuery: unknown,
  deps: Pick<AcquireDeps, 'maxMbPerScenario' | 'now'>,
): Promise<FetchPlan> {
  const connector = getConnector(connectorId)
  const query = ConnectorQuery.parse(rawQuery)
  const estimate = connector.estimate(query)
  const totalBytes = totalOf(estimate)
  const roomBytes = await roomLeft(root, scenarioId, deps.maxMbPerScenario)
  const estimateId = randomUUID()
  const now = (deps.now ?? (() => new Date()))().getTime()
  for (const [id, p] of pending) if (p.expires < now) pending.delete(id)
  pending.set(estimateId, {
    root,
    scenarioId,
    connectorId,
    query,
    totalBytes,
    expires: now + PENDING_MS,
  })
  return {
    estimateId,
    connectorId,
    source: connector.source,
    terms: connector.terms,
    hosts: connector.hosts,
    estimate,
    totalBytes,
    roomBytes,
    exceedsLimit: totalBytes > roomBytes,
  }
}

async function appendLog(root: string, scenarioId: string, entry: object): Promise<void> {
  const file = fetchLogFile(root, scenarioId)
  await ensureDir(dirname(file))
  await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8')
}

/** The framework, not the connector, decides provenance: historical, dated now. */
function withProvenance(
  c: Connector,
  result: ConnectorResult,
  retrieved: string,
  sizes: Map<string, number>,
): CaseDataset[] {
  const provenance: CaseProvenance = {
    origin: 'historical',
    source: c.source,
    retrieved,
    terms: c.terms,
    citation: result.citation ?? '',
    ...(result.modified ? { modified: result.modified } : {}),
  }
  return result.datasets.map((d) => {
    const names = [d.file, ...(d.frames ?? []).map((f) => f.file)].filter((n): n is string => !!n)
    const bytes = names.reduce((n, name) => n + (sizes.get(name) ?? 0), 0)
    return CaseDataset.parse({ ...d, provenance, bytes })
  })
}

function assertFilesMatch(result: ConnectorResult): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const f of result.files)
    sizes.set(f.name, typeof f.data === 'string' ? Buffer.byteLength(f.data) : f.data.byteLength)
  for (const d of result.datasets) {
    const names = [d.file, ...(d.frames ?? []).map((fr) => fr.file)].filter((n): n is string => !!n)
    if (!names.length) throw new AppError('VALIDATION', `Dataset ${d.id} has no data file`)
    for (const n of names)
      if (!sizes.has(n))
        throw new AppError('VALIDATION', `Dataset ${d.id} names ${n}, which was not fetched`)
  }
  return sizes
}

export async function runFetch(
  root: string,
  scenarioId: string,
  estimateId: string,
  consent: boolean,
  deps: AcquireDeps,
): Promise<CaseManifest> {
  if (consent !== true) throw new AppError('FORBIDDEN', 'Fetching needs your consent first')
  const plan = pending.get(estimateId)
  const now = (deps.now ?? (() => new Date()))()
  if (!plan || plan.expires < now.getTime() || plan.root !== root || plan.scenarioId !== scenarioId)
    throw new AppError('CONFLICT', 'Show the size estimate again before fetching')
  pending.delete(estimateId)
  const connector = getConnector(plan.connectorId)
  const room = await roomLeft(root, scenarioId, deps.maxMbPerScenario)
  if (plan.totalBytes > room)
    throw new AppError(
      'VALIDATION',
      `This fetch needs about ${formatBytes(plan.totalBytes)} but only ${formatBytes(room)} is left under the ${deps.maxMbPerScenario} MB limit for this scenario`,
    )
  let received = 0
  let chain: Promise<void> = Promise.resolve()
  const log = (entry: object): void => {
    chain = chain.then(() =>
      appendLog(root, scenarioId, { at: now.toISOString(), connector: connector.id, ...entry }),
    )
  }
  const get = createCaseGet({
    hosts: connector.hosts,
    version: deps.version,
    maxBytes: () => room - received,
    onResponse: (info) => {
      received += info.bytes
      log({ url: redact(info.url), status: info.status, bytes: info.bytes })
    },
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.signal ? { signal: deps.signal } : {}),
  })
  let result: ConnectorResult
  try {
    result = await connector.fetch(plan.query, {
      get,
      ...(deps.signal ? { signal: deps.signal } : {}),
    })
  } catch (err) {
    log({ failed: true, bytes: received })
    await chain
    throw err
  }
  const sizes = assertFilesMatch(result)
  const written = [...sizes.values()].reduce((n, b) => n + b, 0)
  if (written > room)
    throw new AppError(
      'VALIDATION',
      `The fetched data (${formatBytes(written)}) does not fit the limit`,
    )
  const manifest = await addDatasets(
    root,
    scenarioId,
    withProvenance(connector, result, now.toISOString(), sizes),
    result.files,
  )
  log({ done: true, datasets: result.datasets.map((d) => d.id), bytes: received })
  await chain
  return manifest
}

/** Test hook. */
export const clearPendingFetches = (): void => pending.clear()
