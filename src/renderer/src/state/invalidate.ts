// Targeted query invalidation for main's change events (#198). project:changed names what
// changed (and the scenario); job:done names the job's kind. Each maps to the IPC channels
// whose cached answers it can change, scoped to that project and scenario, and bursts are
// coalesced: a 100-inject run no longer refetches every query in the app on every save.
import type { Query, QueryClient } from '@tanstack/react-query'
import type { EventPayload } from '@shared/ipc'
import type { JobKind } from '@shared/schemas/job'

type What = EventPayload<'project:changed'>['what']

/** Channel prefixes (query key [0]) a change can affect. 'project:' matches every project:*. */
const BY_WHAT: Record<What, string[]> = {
  project: ['project:', 'examples:', 'embeddings:status', 'routing:get'],
  documents: ['documents:', 'embeddings:status', 'project:get', 'retrieve:search'],
  scenarios: ['scenarios:', 'project:get', 'facilitator:', 'export:preview-html'],
  // A scenario save (every MSEL autosave) leaves the inject files alone: no injects:list.
  scenario: ['scenarios:', 'project:get', 'facilitator:', 'export:preview-html'],
  injects: ['injects:', 'scenarios:', 'render:', 'facilitator:', 'export:preview-html'],
  media: ['injects:', 'render:', 'facilitator:', 'export:preview-html'],
  prompts: ['prompts:'],
  workflows: ['comfy:'],
  settings: ['settings:', 'routing:', 'embeddings:status'],
  providers: ['providers:', 'routing:', 'embeddings:status'],
  library: ['library:'],
}

const SCENARIO_WORK = [...new Set(BY_WHAT.injects.concat(BY_WHAT.scenario))]
const BY_KIND: Record<JobKind, string[]> = {
  ingest: BY_WHAT.documents.concat('project:facility-facts'),
  reindex: BY_WHAT.documents,
  'embed-model-download': ['embeddings:status', 'settings:'],
  'model-pull': ['providers:'],
  ideate: ['generate:ideas-result'],
  'generate-scenario': SCENARIO_WORK,
  'rerun-stage': SCENARIO_WORK,
  'generate-injects': SCENARIO_WORK,
  'render-media': SCENARIO_WORK,
  'repair-scenario': SCENARIO_WORK,
  export: [],
}

export interface Change {
  channels: string[]
  /** Only queries for this project ('' = any). */
  path: string
  /** Only queries for this scenario, when the query names one. */
  scenarioId?: string
}

export function changeFromEvent(e: EventPayload<'project:changed'>): Change {
  const channels = BY_WHAT[e.what] ?? ['']
  return { channels, path: e.path, ...(e.scenarioId ? { scenarioId: e.scenarioId } : {}) }
}

export function changeFromJob(
  kind: JobKind,
  meta: { projectPath?: string; scenarioId?: string } = {},
): Change {
  return {
    channels: BY_KIND[kind] ?? [''],
    path: meta.projectPath ?? '',
    ...(meta.scenarioId ? { scenarioId: meta.scenarioId } : {}),
  }
}

const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, '') === b.replace(/[\\/]+$/, '')

function requestOf(query: Query): Record<string, unknown> {
  const req = query.queryKey[1]
  return req && typeof req === 'object' ? (req as Record<string, unknown>) : {}
}

/** Whether a cached query ([channel, request]) can be affected by a change. */
export function affects(change: Change, query: Query): boolean {
  const channel = String(query.queryKey[0] ?? '')
  if (!change.channels.some((c) => channel.startsWith(c))) return false
  const req = requestOf(query)
  const project = req.projectPath ?? req.path
  if (change.path && typeof project === 'string' && !samePath(project, change.path)) return false
  const scenario = req.scenarioId
  if (change.scenarioId && typeof scenario === 'string' && scenario !== change.scenarioId) {
    return false
  }
  return true
}

/**
 * Collects changes and invalidates at most once per `windowMs`: the first change in a quiet
 * period goes out at once, later ones are merged into one trailing flush.
 */
export function createInvalidator(client: QueryClient, windowMs = 250) {
  let pending: Change[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = -Infinity
  const flush = () => {
    timer = undefined
    last = Date.now()
    const changes = pending
    pending = []
    if (!changes.length) return
    void client.invalidateQueries({ predicate: (q) => changes.some((c) => affects(c, q)) })
  }
  return {
    push(change: Change) {
      pending.push(change)
      if (timer) return
      const wait = last + windowMs - Date.now()
      if (wait <= 0) flush()
      else timer = setTimeout(flush, wait)
    },
    dispose() {
      if (timer) clearTimeout(timer)
      timer = undefined
      pending = []
    },
  }
}
