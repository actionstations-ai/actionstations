// One store for every background job the window knows about (#197). It is fed by jobs:list
// (active and interrupted jobs when the window connects) and by job:progress / job:done, so
// any screen can reattach to its job after navigation: no screen keeps job ids of its own.
// Pure reducers below; the connection (subscriptions, list, lookups) follows them.
import { create } from 'zustand'
import type {
  Job,
  JobAwaiting,
  JobDoneEvent,
  JobKind,
  JobProgressEvent,
  JobStatus,
} from '@shared/schemas/job'
import { call, subscribe } from '../lib/api'

export interface ItemProgress {
  progress: number
  message: string
  stage?: string
}

export interface TrackedJob {
  id: string
  kind: JobKind
  status: JobStatus
  progress: number
  message: string
  projectPath?: string
  scenarioId?: string
  payload?: unknown
  resumable: boolean
  error?: string
  result?: unknown
  /** Main told us which project/scenario the job is for (jobs:list, jobs:get or its starter). */
  known: boolean
  /** Item ids (inject, row or document ids) in the order the job reached them; last is current. */
  items: string[]
  /** Latest progress per item, for screens that show one bar per item (documents). */
  itemProgress: Record<string, ItemProgress>
  /** Insertion order: higher is newer. */
  seq: number
  /** The job waits for the user to approve a cloud request (#433). */
  awaiting?: JobAwaiting
}

export type JobMap = Record<string, TrackedJob>

export const SCENARIO_OWNER_KINDS: readonly JobKind[] = [
  'generate-scenario',
  'rerun-stage',
  'generate-injects',
  'render-media',
  'repair-scenario',
  'draft-aar',
]
/** What a job is doing, for banners and the jobs tray. */
export const JOB_LABEL: Record<JobKind, string> = {
  ingest: 'Importing documents',
  reindex: 'Rebuilding the index',
  'embed-model-download': 'Downloading the embedding model',
  'model-pull': 'Downloading a model',
  ideate: 'Writing scenario ideas',
  'generate-scenario': 'Generating the scenario',
  'rerun-stage': 'Re-running a stage',
  'generate-injects': 'Writing injects',
  'render-media': 'Rendering media',
  'repair-scenario': 'Repairing the scenario',
  'draft-aar': 'Drafting the AAR/IP',
  export: 'Exporting',
  'pack-download': 'Downloading a pack',
  'tool-install': 'Installing a local tool',
  'plan-check': 'Checking plans for conflicts',
  'grounding-verify': 'Verifying sources with the model',
  transcribe: 'Transcribing the hot wash',
  'generate-redlines': 'Drafting plan changes',
  'redline-export': 'Exporting plan changes',
  'build-drill': 'Building the drill',
  'drill-export': 'Exporting drill results',
  'build-micro-drill': 'Building the short drill',
  translate: 'Translating player material',
}
const MAX_FINISHED = 50
const MAX_ITEMS = 500

export const isRunning = (j: { status: JobStatus } | null | undefined): boolean =>
  j?.status === 'queued' || j?.status === 'running'
export const isTerminal = (j: { status: JobStatus } | null | undefined): boolean =>
  j?.status === 'done' || j?.status === 'error' || j?.status === 'cancelled'

let seqCounter = 0
const nextSeq = () => ++seqCounter

function blank(id: string, kind: JobKind): TrackedJob {
  return {
    id,
    kind,
    status: 'queued',
    progress: 0,
    message: 'Queued',
    resumable: false,
    known: false,
    items: [],
    itemProgress: {},
    seq: nextSeq(),
  }
}

/** A full record from main: fills the meta; status only moves forward from a settled entry. */
export function withJob(prev: TrackedJob | undefined, job: Job): TrackedJob {
  const base = prev ?? blank(job.id, job.kind)
  const keepStatus = !job.status || (prev && isTerminal(prev) && !isTerminal(job))
  return {
    ...base,
    kind: job.kind ?? base.kind,
    ...(keepStatus
      ? {}
      : {
          status: job.status,
          progress: job.progress,
          message: job.message,
          resumable: job.resumable,
          awaiting: job.awaiting,
        }),
    ...(job.projectPath ? { projectPath: job.projectPath } : {}),
    ...(job.scenarioId ? { scenarioId: job.scenarioId } : {}),
    ...(job.payload !== undefined ? { payload: job.payload } : {}),
    ...(job.error && !keepStatus ? { error: job.error } : {}),
    ...(job.result !== undefined && !keepStatus ? { result: job.result } : {}),
    known: true,
  }
}

function withItem(items: string[], itemId: string | undefined): string[] {
  if (!itemId || items.at(-1) === itemId) return items
  return [...items.filter((i) => i !== itemId), itemId].slice(-MAX_ITEMS)
}

export function withProgress(prev: TrackedJob | undefined, e: JobProgressEvent): TrackedJob {
  const base = prev ?? blank(e.jobId, e.kind)
  // Main sends a last progress event with the final status just before job:done; only
  // job:done carries the result and error, so it alone settles the job.
  if (isTerminal(base) || isTerminal(e)) return base
  const item: ItemProgress = {
    progress: e.progress,
    message: e.message,
    ...(e.stage ? { stage: e.stage } : {}),
  }
  return {
    ...base,
    kind: e.kind,
    status: e.status,
    progress: e.progress,
    message: e.message,
    awaiting: e.awaiting,
    items: withItem(base.items, e.itemId),
    itemProgress: e.itemId ? { ...base.itemProgress, [e.itemId]: item } : base.itemProgress,
  }
}

export function withDone(prev: TrackedJob | undefined, e: JobDoneEvent): TrackedJob {
  const base = prev ?? blank(e.jobId, e.kind)
  const message = e.status === 'done' ? 'Done' : e.status === 'cancelled' ? 'Cancelled' : 'Failed'
  return {
    ...base,
    kind: e.kind,
    status: e.status,
    progress: e.status === 'done' ? 1 : base.progress,
    message: e.error ?? message,
    resumable: false,
    awaiting: undefined,
    ...(e.error ? { error: e.error } : {}),
    ...(e.result !== undefined ? { result: e.result } : {}),
  }
}

/** Keep every unfinished job plus the most recent finished ones. */
export function pruneJobs(jobs: JobMap): JobMap {
  const finished = Object.values(jobs)
    .filter(isTerminal)
    .sort((a, b) => b.seq - a.seq)
  if (finished.length <= MAX_FINISHED) return jobs
  const next = { ...jobs }
  for (const j of finished.slice(MAX_FINISHED)) delete next[j.id]
  return next
}

/** The newest job matching `pred`, or null. */
export function latestJob(jobs: JobMap, pred: (j: TrackedJob) => boolean): TrackedJob | null {
  let best: TrackedJob | null = null
  for (const j of Object.values(jobs)) if (pred(j) && (!best || j.seq > best.seq)) best = j
  return best
}

const forScenario = (j: TrackedJob, projectPath: string, scenarioId: string): boolean =>
  j.scenarioId === scenarioId &&
  j.projectPath === projectPath &&
  SCENARIO_OWNER_KINDS.includes(j.kind)

/** The queued/running generation job that owns a scenario (one at a time, #98). */
export const scenarioOwner = (jobs: JobMap, projectPath: string, scenarioId: string) =>
  latestJob(jobs, (j) => isRunning(j) && forScenario(j, projectPath, scenarioId))

/**
 * A generation job for the scenario that an app exit interrupted (paused). It does not own
 * the scenario: the screens offer Resume (when main can resume it) or Dismiss instead.
 */
export const interruptedJob = (jobs: JobMap, projectPath: string, scenarioId: string) =>
  latestJob(jobs, (j) => j.status === 'paused' && forScenario(j, projectPath, scenarioId))

interface JobsState {
  jobs: JobMap
}

export const useJobsStore = create<JobsState>(() => ({ jobs: {} }))

function put(id: string, fn: (prev: TrackedJob | undefined) => TrackedJob | undefined): void {
  useJobsStore.setState((s) => {
    const next = fn(s.jobs[id])
    if (!next || next === s.jobs[id]) return s
    return { jobs: pruneJobs({ ...s.jobs, [id]: next }) }
  })
}

// --- connection -----------------------------------------------------------------------------

let refs = 0
let generation = 0
let offs: (() => void)[] = []
const lookups = new Set<string>()

/** Ask main who a job we only know from an event belongs to (once per job). */
function lookUp(id: string): void {
  if (lookups.has(id)) return
  lookups.add(id)
  const gen = generation
  void call('jobs:get', { jobId: id })
    .then((job) => gen === generation && put(id, (prev) => withJob(prev, job)))
    // Unknown to main (pruned, or a fake in tests): settle for what the events said.
    .catch(() => gen === generation && put(id, (prev) => prev && { ...prev, known: true }))
}

function start(): void {
  const gen = ++generation
  offs = [
    subscribe('job:progress', (e) => {
      put(e.jobId, (prev) => withProgress(prev, e))
      if (!useJobsStore.getState().jobs[e.jobId]?.known) lookUp(e.jobId)
    }),
    subscribe('job:done', (e) => {
      put(e.jobId, (prev) => withDone(prev, e))
      if (!useJobsStore.getState().jobs[e.jobId]?.known) lookUp(e.jobId)
    }),
  ]
  void call('jobs:list', { activeOnly: true })
    .then((list) => {
      if (gen !== generation) return
      // jobs:list is newest first; give the oldest the lowest seq.
      for (const job of [...list].reverse()) put(job.id, (prev) => withJob(prev, job))
    })
    .catch(() => undefined)
}

function stop(): void {
  generation++
  offs.forEach((off) => off())
  offs = []
  lookups.clear()
  useJobsStore.setState({ jobs: {} })
}

/**
 * Hold the store's connection to main while a consumer is mounted (reference counted). The
 * shell's jobs tray holds it for the window's life; when the last holder goes, the store is
 * emptied (a fresh window or test starts clean).
 */
export function connectJobs(): () => void {
  if (refs++ === 0) start()
  let released = false
  return () => {
    if (released) return
    released = true
    if (--refs === 0) stop()
  }
}

/** Register a job this window just started, before (or after) its first event. */
export function trackJob(
  id: string,
  meta: { kind: JobKind; projectPath?: string; scenarioId?: string; payload?: unknown },
): void {
  put(id, (prev) => {
    const base = prev ?? blank(id, meta.kind)
    const projectPath = base.projectPath ?? meta.projectPath
    const scenarioId = base.scenarioId ?? meta.scenarioId
    const payload = base.payload ?? meta.payload
    return {
      ...base,
      kind: meta.kind,
      ...(projectPath ? { projectPath } : {}),
      ...(scenarioId ? { scenarioId } : {}),
      ...(payload !== undefined ? { payload } : {}),
      known: true,
    }
  })
}

/** Make sure a job id is in the store (reattach by id): read it from main when missing. */
export function ensureJob(id: string): void {
  if (!useJobsStore.getState().jobs[id]) lookUp(id)
}

/** Drop a finished job from the store (the tray's Dismiss for a finished job). */
export function forgetJob(id: string): void {
  useJobsStore.setState((s) => {
    if (!s.jobs[id]) return s
    const next = { ...s.jobs }
    delete next[id]
    return { jobs: next }
  })
}

/** The JobDoneEvent a settled entry corresponds to (for screens' onDone callbacks). */
export function doneEventOf(j: TrackedJob): JobDoneEvent {
  return {
    jobId: j.id,
    kind: j.kind,
    status: j.status as JobDoneEvent['status'],
    ...(j.error ? { error: j.error } : {}),
    ...(j.result !== undefined ? { result: j.result } : {}),
  }
}
