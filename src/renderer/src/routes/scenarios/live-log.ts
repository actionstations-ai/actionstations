// Pure state for the live generation log: progress messages plus streamed model text per
// stage (and item). Rehydrated from jobs:log after a reload.
import type { JobLogEntry } from '@shared/ipc'
import type { Job, JobProgressEvent, JobStatus, JobTokenEvent } from '@shared/schemas/job'

export interface LogStream {
  key: string
  stage: string
  itemId?: string
  text: string
}

export interface LiveLog {
  jobId: string | null
  status: JobStatus | null
  progress: number
  message: string
  entries: JobLogEntry[]
  streams: LogStream[]
}

export const MAX_ENTRIES = 500

export const emptyLog = (jobId: string | null = null): LiveLog => ({
  jobId,
  status: null,
  progress: 0,
  message: '',
  entries: [],
  streams: [],
})

export const streamKey = (stage: string, itemId?: string): string =>
  itemId ? `${stage}:${itemId}` : stage

function parseKey(key: string): { stage: string; itemId?: string } {
  const i = key.indexOf(':')
  return i < 0 ? { stage: key } : { stage: key.slice(0, i), itemId: key.slice(i + 1) }
}

/** A progress event becomes a log line whenever its message changes. */
export function applyProgress(log: LiveLog, e: JobProgressEvent, at = new Date()): LiveLog {
  if (e.jobId !== log.jobId) return log
  const changed = e.message && e.message !== log.message
  const entry: JobLogEntry = {
    at: at.toISOString(),
    level: e.status === 'error' ? 'error' : 'info',
    message: e.message,
    ...(e.stage ? { stage: e.stage } : {}),
    ...(e.itemId ? { itemId: e.itemId } : {}),
  }
  return {
    ...log,
    status: e.status,
    progress: e.progress,
    message: e.message,
    entries: changed ? [...log.entries, entry].slice(-MAX_ENTRIES) : log.entries,
  }
}

export function applyToken(log: LiveLog, e: JobTokenEvent): LiveLog {
  if (e.jobId !== log.jobId) return log
  const key = streamKey(e.stage, e.itemId)
  const existing = log.streams.find((s) => s.key === key)
  const streams = existing
    ? log.streams.map((s) => (s.key === key ? { ...s, text: s.text + e.text } : s))
    : [
        ...log.streams,
        { key, stage: e.stage, ...(e.itemId ? { itemId: e.itemId } : {}), text: e.text },
      ]
  return { ...log, streams }
}

/** Replace state with what main recorded for the job (authoritative after a reload). */
export function seedFromJob(
  job: Job,
  recorded: { entries: JobLogEntry[]; tokens: Record<string, string> },
): LiveLog {
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    entries: recorded.entries.slice(-MAX_ENTRIES),
    streams: Object.entries(recorded.tokens).map(([key, text]) => ({
      key,
      ...parseKey(key),
      text,
    })),
  }
}

export const isActive = (log: LiveLog): boolean =>
  log.status === 'queued' || log.status === 'running'
