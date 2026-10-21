// Pure state transitions for live job progress, keyed by "target" (a document id, or the
// INDEX_TARGET sentinel for a rebuild). The hook in use-job-progress.ts wires them to events.
import type { JobProgressEvent } from '@shared/schemas/job'

export const INDEX_TARGET = '__index__'

export interface LiveProgress {
  jobId: string
  progress: number
  message: string
  stage?: string
}

export type LiveMap = Record<string, LiveProgress>

/**
 * Apply one progress event. When the event names an item that is one of the job's targets,
 * only that target moves; otherwise every target of the job shows the job-level progress.
 */
export function applyProgress(live: LiveMap, targets: string[], e: JobProgressEvent): LiveMap {
  const hit = e.itemId && targets.includes(e.itemId) ? [e.itemId] : targets
  const next = { ...live }
  for (const t of hit) {
    next[t] = {
      jobId: e.jobId,
      progress: e.progress,
      message: e.message,
      ...(e.stage ? { stage: e.stage } : {}),
    }
  }
  return next
}

/** Drop every target the finished job was driving. */
export function clearJob(live: LiveMap, jobId: string): LiveMap {
  const next: LiveMap = {}
  for (const [t, p] of Object.entries(live)) if (p.jobId !== jobId) next[t] = p
  return next
}

/** Seed targets with a zero-progress entry so the UI shows activity before the first event. */
export function seedJob(live: LiveMap, jobId: string, targets: string[], message: string): LiveMap {
  const next = { ...live }
  for (const t of targets) next[t] = { jobId, progress: 0, message }
  return next
}
