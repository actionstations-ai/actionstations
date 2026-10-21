import PQueue from 'p-queue'
import type { Job, JobKind, JobStatus } from '@shared/schemas'
import type { JobLogEntry } from '@shared/ipc'
import { emit } from '../lib/events'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'

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

interface JobRecord {
  job: Job
  controller: AbortController
  log: JobLogEntry[]
  tokens: Record<string, string>
  promise: Promise<unknown>
}

const CONCURRENCY: Partial<Record<JobKind, number>> = {
  ingest: 2,
  'render-media': 2,
  'generate-scenario': 1,
  'rerun-stage': 1,
  'generate-injects': 1,
}
const MAX_LOG = 2000
const MAX_TOKENS_PER_STAGE = 200_000
const MAX_FINISHED = 100

/** In-process job queue with progress/log/token streaming over IPC events. */
export class JobManager {
  private jobs = new Map<string, JobRecord>()
  private queues = new Map<JobKind, PQueue>()

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
    const rec: JobRecord = { job, controller, log: [], tokens: {}, promise: Promise.resolve() }
    this.jobs.set(id, rec)
    const ctx = this.context(rec)
    rec.promise = this.queue(kind).add(async () => {
      if (controller.signal.aborted) return
      this.update(rec, { status: 'running', message: 'Running' })
      try {
        const result = await run(ctx)
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
  }

  private emitProgress(rec: JobRecord, extra?: { stage?: string; itemId?: string }): void {
    const { id, kind, status, progress, message } = rec.job
    emit('job:progress', { jobId: id, kind, status, progress, message, ...extra })
  }

  private finish(
    rec: JobRecord,
    status: Extract<JobStatus, 'done' | 'error' | 'cancelled'>,
    result?: unknown,
    error?: string,
  ): void {
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
    this.prune()
  }

  get(id: string): Job {
    const rec = this.jobs.get(id)
    if (!rec) throw new AppError('NOT_FOUND', `No job ${id}`)
    return rec.job
  }

  list(filter: { projectPath?: string; activeOnly?: boolean } = {}): Job[] {
    return [...this.jobs.values()]
      .map((r) => r.job)
      .filter((j) => !filter.projectPath || j.projectPath === filter.projectPath)
      .filter((j) => !filter.activeOnly || j.status === 'queued' || j.status === 'running')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  cancel(id: string): void {
    const rec = this.jobs.get(id)
    if (!rec) throw new AppError('NOT_FOUND', `No job ${id}`)
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
  }

  logOf(id: string): { entries: JobLogEntry[]; tokens: Record<string, string> } {
    const rec = this.jobs.get(id)
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
