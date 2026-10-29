import PQueue from 'p-queue'
import type { Job, JobAwaiting, JobKind, JobStatus } from '@shared/schemas'
import type { JobLogEntry } from '@shared/ipc'
import { emit } from '../lib/events'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { JobsFileWriter, readPersistedJobs } from './persist'
import { runInJobScope } from './scope'

export interface JobContext {
  jobId: string
  signal: AbortSignal
  progress(progress: number, message?: string, extra?: { stage?: string; itemId?: string }): void
  log(
    message: string,
    level?: JobLogEntry['level'],
    extra?: { stage?: string; itemId?: string },
  ): void
  token(stage: string, text: string, itemId?: string): void
  throwIfCancelled(): void
}

export type JobRunner<T> = (ctx: JobContext) => Promise<T>

/** Starts a fresh job that continues the work of a paused one; returns the new job. */
export type JobResumer = (paused: Job) => Promise<Job>

interface JobRecord {
  job: Job
  controller: AbortController
  log: JobLogEntry[]
  tokens: Record<string, string>
  promise: Promise<unknown>
  /** Called once when the job reaches done / error / cancelled (not persisted). */
  onSettled?: (job: Job) => void
  /** The message to restore when a cloud approval arrives. */
  resumeMessage?: string | undefined
}

const CONCURRENCY: Partial<Record<JobKind, number>> = {
  ingest: 2,
  'render-media': 2,
  'generate-scenario': 1,
  'rerun-stage': 1,
  'generate-injects': 1,
  'repair-scenario': 1,
  'draft-aar': 1,
  'model-pull': 1,
  'plan-check': 1,
  'grounding-verify': 1,
  transcribe: 1,
}
/**
 * Jobs that own their scenario while they run (scenario/busy). A new one supersedes any
 * interrupted (paused) record for the same scenario: that work is being redone.
 */
export const SCENARIO_OWNER_KINDS: readonly JobKind[] = [
  'generate-scenario',
  'rerun-stage',
  'generate-injects',
  'render-media',
  'repair-scenario',
  'draft-aar',
]
const MAX_LOG = 2000
const MAX_TOKENS_PER_STAGE = 200_000
const MAX_FINISHED = 100

/**
 * In-process job queue with progress/log/token streaming over IPC events. Job records are
 * mirrored to userData/jobs.json (#54); records left over from a previous run are read on
 * first use and shown as paused, resumable when a registered resumer exists for their kind.
 */
export class JobManager {
  private jobs = new Map<string, JobRecord>()
  private queues = new Map<JobKind, PQueue>()
  /** Records restored from disk (previous app run); not backed by a running promise. */
  private restored = new Map<string, Job>()
  private resumers = new Map<JobKind, JobResumer>()
  private hydrated = false
  private writer: JobsFileWriter | undefined

  constructor(private readonly persist = true) {}

  private hydrate(): void {
    if (this.hydrated) return
    this.hydrated = true
    if (!this.persist) return
    this.writer = new JobsFileWriter()
    for (const job of readPersistedJobs()) {
      if (!this.jobs.has(job.id)) this.restored.set(job.id, job)
    }
  }

  private save(): void {
    this.hydrate()
    this.writer?.schedule([...this.restored.values(), ...[...this.jobs.values()].map((r) => r.job)])
  }

  /**
   * Write pending job records now (tests, app quit). The write is synchronous, so calling it
   * from before-quit (which cannot await) still persists a job that just finished.
   */
  flush(): Promise<void> {
    this.writer?.flushSync()
    return Promise.resolve()
  }

  registerResumer(kind: JobKind, resumer: JobResumer): void {
    this.resumers.set(kind, resumer)
  }

  /** Resume a paused job from a previous run; the work continues as a new job. */
  async resume(id: string): Promise<Job> {
    this.hydrate()
    const paused = this.restored.get(id)
    if (!paused) throw new AppError('NOT_FOUND', `No paused job ${id}`)
    if (paused.status !== 'paused' || !paused.resumable) {
      throw new AppError('VALIDATION', `Job ${id} cannot be resumed (${paused.status})`)
    }
    const resumer = this.resumers.get(paused.kind)
    if (!resumer) throw new AppError('NOT_IMPLEMENTED', `No resumer for ${paused.kind} jobs`)
    const next = await resumer(paused)
    // The resumed work is the new job; the old record goes (start() has usually already
    // superseded it, which told the windows; otherwise tell them here).
    const stillPaused = this.restored.get(id)?.status === 'paused'
    this.restored.delete(id)
    this.save()
    if (stillPaused) emit('job:done', { jobId: id, kind: paused.kind, status: 'cancelled' })
    return next
  }

  /**
   * End a record restored from a previous run (cancel, resume, superseded): it stays in the
   * history as cancelled, and job:done tells every window it no longer owns its scenario.
   */
  private settleRestored(id: string, message: string): void {
    const restored = this.restored.get(id)
    if (!restored) return
    this.restored.set(id, {
      ...restored,
      status: 'cancelled',
      message,
      resumable: false,
      updatedAt: nowIso(),
    })
    this.save()
    emit('job:done', { jobId: id, kind: restored.kind, status: 'cancelled' })
  }

  /** A new scenario-owning job replaces interrupted records for the same scenario. */
  private supersedePaused(kind: JobKind, projectPath?: string, scenarioId?: string): void {
    if (!scenarioId || !SCENARIO_OWNER_KINDS.includes(kind)) return
    for (const job of [...this.restored.values()]) {
      if (
        job.status === 'paused' &&
        job.scenarioId === scenarioId &&
        job.projectPath === projectPath &&
        SCENARIO_OWNER_KINDS.includes(job.kind)
      ) {
        this.settleRestored(job.id, 'Superseded by a newer job')
      }
    }
  }

  private queue(kind: JobKind): PQueue {
    let q = this.queues.get(kind)
    if (!q) {
      q = new PQueue({ concurrency: CONCURRENCY[kind] ?? 4 })
      this.queues.set(kind, q)
    }
    return q
  }

  start<T>(
    kind: JobKind,
    run: JobRunner<T>,
    meta: {
      projectPath?: string
      scenarioId?: string
      payload?: unknown
      resumable?: boolean
      onSettled?: (job: Job) => void
    } = {},
  ): Job {
    const id = newId()
    const now = nowIso()
    const job: Job = {
      id,
      kind,
      status: 'queued',
      progress: 0,
      message: 'Queued',
      createdAt: now,
      updatedAt: now,
      resumable: meta.resumable ?? false,
      ...(meta.projectPath ? { projectPath: meta.projectPath } : {}),
      ...(meta.scenarioId ? { scenarioId: meta.scenarioId } : {}),
      ...(meta.payload !== undefined ? { payload: meta.payload } : {}),
    }
    const controller = new AbortController()
    const rec: JobRecord = {
      job,
      controller,
      log: [],
      tokens: {},
      promise: Promise.resolve(),
      ...(meta.onSettled ? { onSettled: meta.onSettled } : {}),
    }
    this.hydrate()
    this.supersedePaused(kind, meta.projectPath, meta.scenarioId)
    this.jobs.set(id, rec)
    const ctx = this.context(rec)
    rec.promise = this.queue(kind).add(async () => {
      if (controller.signal.aborted) return
      this.update(rec, { status: 'running', message: 'Running' })
      try {
        const scope = {
          jobId: id,
          signal: controller.signal,
          ...(meta.projectPath ? { projectPath: meta.projectPath } : {}),
        }
        const result = await runInJobScope(scope, () => run(ctx))
        if (controller.signal.aborted) return this.finish(rec, 'cancelled')
        this.finish(rec, 'done', result)
      } catch (err) {
        if (controller.signal.aborted) return this.finish(rec, 'cancelled')
        const message = err instanceof Error ? err.message : String(err)
        ctx.log(message, 'error')
        this.finish(rec, 'error', undefined, message)
      }
    })
    this.emitProgress(rec)
    return job
  }

  private context(rec: JobRecord): JobContext {
    return {
      jobId: rec.job.id,
      signal: rec.controller.signal,
      progress: (progress, message, extra) => {
        this.update(
          rec,
          { progress: Math.min(1, Math.max(0, progress)), ...(message ? { message } : {}) },
          extra,
        )
      },
      log: (message, level = 'info', extra) => {
        rec.log.push({ at: nowIso(), level, message, ...extra })
        if (rec.log.length > MAX_LOG) rec.log.splice(0, rec.log.length - MAX_LOG)
      },
      token: (stage, text, itemId) => {
        const key = itemId ? `${stage}:${itemId}` : stage
        const prev = rec.tokens[key] ?? ''
        rec.tokens[key] = (prev + text).slice(-MAX_TOKENS_PER_STAGE)
        emit('job:token', { jobId: rec.job.id, stage, text, ...(itemId ? { itemId } : {}) })
      },
      throwIfCancelled: () => {
        if (rec.controller.signal.aborted) throw new AppError('CANCELLED', 'Cancelled')
      },
    }
  }

  private update(
    rec: JobRecord,
    patch: Partial<Job>,
    extra?: { stage?: string; itemId?: string },
  ): void {
    rec.job = { ...rec.job, ...patch, updatedAt: nowIso() }
    this.emitProgress(rec, extra)
    if (patch.status) this.save()
  }

  private emitProgress(rec: JobRecord, extra?: { stage?: string; itemId?: string }): void {
    const { id, kind, status, progress, message, awaiting } = rec.job
    emit('job:progress', {
      jobId: id,
      kind,
      status,
      progress,
      message,
      ...extra,
      ...(awaiting ? { awaiting } : {}),
    })
  }

  /**
   * Mark a running job as waiting for a cloud approval, or clear the mark (#433). The status
   * stays `running`; the message says what the job waits for. Unknown or finished jobs: no-op.
   */
  setAwaiting(id: string, awaiting: JobAwaiting | undefined): void {
    const rec = this.jobs.get(id)
    if (!rec || rec.job.status !== 'running') return
    if (awaiting) {
      if (!rec.job.awaiting) rec.resumeMessage = rec.job.message
      this.update(rec, { awaiting, message: 'Waiting for your approval' })
      return
    }
    if (!rec.job.awaiting) return
    const { awaiting: _cleared, ...rest } = rec.job
    rec.job = rest
    this.update(rec, { message: rec.resumeMessage ?? 'Running' })
    rec.resumeMessage = undefined
  }

  private finish(
    rec: JobRecord,
    status: Extract<JobStatus, 'done' | 'error' | 'cancelled'>,
    result?: unknown,
    error?: string,
  ): void {
    if (rec.job.awaiting) {
      const { awaiting: _cleared, ...rest } = rec.job
      rec.job = rest
    }
    this.update(rec, {
      status,
      progress: status === 'done' ? 1 : rec.job.progress,
      message:
        status === 'done' ? 'Done' : status === 'cancelled' ? 'Cancelled' : (error ?? 'Failed'),
      ...(result !== undefined ? { result } : {}),
      ...(error ? { error } : {}),
    })
    emit('job:done', {
      jobId: rec.job.id,
      kind: rec.job.kind,
      status,
      ...(result !== undefined ? { result } : {}),
      ...(error ? { error } : {}),
    })
    const settled = rec.onSettled
    rec.onSettled = undefined
    settled?.(rec.job)
    this.prune()
  }

  get(id: string): Job {
    this.hydrate()
    const rec = this.jobs.get(id)
    if (rec) return rec.job
    const restored = this.restored.get(id)
    if (!restored) throw new AppError('NOT_FOUND', `No job ${id}`)
    return restored
  }

  /** Paused jobs count as active: they are waiting for the user to resume or cancel them. */
  list(filter: { projectPath?: string; activeOnly?: boolean } = {}): Job[] {
    this.hydrate()
    const active = new Set<JobStatus>(['queued', 'running', 'paused'])
    return [...this.restored.values(), ...[...this.jobs.values()].map((r) => r.job)]
      .filter((j) => !filter.projectPath || j.projectPath === filter.projectPath)
      .filter((j) => !filter.activeOnly || active.has(j.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  cancel(id: string): void {
    this.hydrate()
    const rec = this.jobs.get(id)
    if (!rec) {
      const restored = this.restored.get(id)
      if (!restored) throw new AppError('NOT_FOUND', `No job ${id}`)
      if (restored.status === 'paused') this.settleRestored(id, 'Cancelled')
      return
    }
    rec.controller.abort()
    // A queued job won't reach its runner for a while; report it cancelled now.
    if (rec.job.status === 'queued') this.finish(rec, 'cancelled')
  }

  /** Keep the most recent finished jobs; drop old ones (and their token buffers). */
  private prune(): void {
    const finished = [...this.jobs.values()].filter((r) =>
      ['done', 'error', 'cancelled'].includes(r.job.status),
    )
    if (finished.length <= MAX_FINISHED) return
    finished
      .sort((a, b) => a.job.updatedAt.localeCompare(b.job.updatedAt))
      .slice(0, finished.length - MAX_FINISHED)
      .forEach((r) => this.jobs.delete(r.job.id))
    this.save()
  }

  /** A record from a previous run has no log or tokens (never persisted): it reads as empty. */
  logOf(id: string): { entries: JobLogEntry[]; tokens: Record<string, string> } {
    this.hydrate()
    const rec = this.jobs.get(id)
    if (!rec && this.restored.has(id)) return { entries: [], tokens: {} }
    if (!rec) throw new AppError('NOT_FOUND', `No job ${id}`)
    return { entries: rec.log, tokens: rec.tokens }
  }

  /** Resolve when the job settles (tests, e2e helpers). */
  async wait(id: string): Promise<Job> {
    const rec = this.jobs.get(id)
    if (!rec) throw new AppError('NOT_FOUND', `No job ${id}`)
    await rec.promise
    return rec.job
  }
}

export const jobs = new JobManager()
