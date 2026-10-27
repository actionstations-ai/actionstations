// Job records (never tokens or logs) persisted to userData/jobs.json (#54). On the next start,
// jobs that were queued/running are shown as 'paused'; the resumable ones (a scenario pipeline
// with checkpoints) can be picked up again through jobs:resume → generate:continue.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { Job, type JobKind } from '@shared/schemas'
import { isRenameRetryable, RENAME_RETRY_DELAYS_MS } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { userDataPath } from '../lib/paths'

export const RESUMABLE_KINDS: readonly JobKind[] = ['generate-scenario', 'rerun-stage']
const MAX_RECORDS = 100
const WRITE_DELAY_MS = 150

const JobsFile = z.object({ jobs: z.array(Job).default([]) })

/** userData/jobs.json, or undefined when no userData dir is available (bare unit tests). */
export function jobsFilePath(): string | undefined {
  try {
    return userDataPath('jobs.json')
  } catch {
    return undefined
  }
}

/** A job interrupted by an app exit: paused, and resumable when it left checkpoints behind. */
export function pauseInterrupted(job: Job): Job {
  if (job.status !== 'queued' && job.status !== 'running') return job
  const resumable = RESUMABLE_KINDS.includes(job.kind) && !!job.scenarioId && !!job.projectPath
  return {
    ...job,
    status: 'paused',
    resumable,
    message: resumable ? 'Interrupted — resumable' : 'Interrupted by app exit',
    updatedAt: nowIso(),
  }
}

/** Read the file synchronously (first list() must not race the write); bad files are ignored. */
export function readPersistedJobs(file = jobsFilePath()): Job[] {
  if (!file) return []
  try {
    const parsed = JobsFile.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return parsed.success ? parsed.data.jobs.map(pauseInterrupted) : []
  } catch {
    return []
  }
}

/** Debounced writer; the last snapshot wins and failures only log. */
export class JobsFileWriter {
  private timer: NodeJS.Timeout | undefined
  private pending: Job[] | undefined
  constructor(private readonly file = jobsFilePath()) {}

  get enabled(): boolean {
    return !!this.file
  }

  schedule(jobs: Job[]): void {
    if (!this.file) return
    this.pending = jobs
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_RECORDS)
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), WRITE_DELAY_MS)
    this.timer.unref?.()
  }

  async flush(): Promise<void> {
    this.flushSync()
  }

  /** Atomic synchronous write (temp file + rename): safe to call while the app quits. */
  flushSync(): void {
    clearTimeout(this.timer)
    const jobs = this.pending
    this.pending = undefined
    if (!this.file || !jobs) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = join(dirname(this.file), `.${randomBytes(6).toString('hex')}.tmp`)
      writeFileSync(tmp, JSON.stringify({ jobs }, null, 2) + '\n')
      renameSyncWithRetry(tmp, this.file)
    } catch (err) {
      console.warn('[jobs] could not persist jobs.json:', err)
    }
  }
}

/** renameWithRetry (lib/fs.ts, #375) for the synchronous quit-time flush. */
function renameSyncWithRetry(from: string, to: string): void {
  const pause = new Int32Array(new SharedArrayBuffer(4))
  for (let attempt = 0; ; attempt++) {
    try {
      return renameSync(from, to)
    } catch (err) {
      if (!isRenameRetryable(err) || attempt >= RENAME_RETRY_DELAYS_MS.length) {
        rmSync(from, { force: true })
        throw err
      }
      Atomics.wait(pause, 0, 0, RENAME_RETRY_DELAYS_MS[attempt])
    }
  }
}
