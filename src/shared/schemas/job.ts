import { z } from 'zod'
import { Id, IsoDateTime } from './common'

export const JobKind = z.enum([
  'ingest',
  'reindex',
  'embed-model-download',
  'model-pull',
  'ideate',
  'generate-scenario',
  'rerun-stage',
  'generate-injects',
  'render-media',
  'repair-scenario',
  'draft-aar',
  'export',
  'pack-download',
  'tool-install',
  'plan-check',
  'grounding-verify',
  'transcribe',
  'generate-redlines',
  'redline-export',
  'build-drill',
  'drill-export',
  'build-micro-drill',
  'translate',
  'simcell-personas',
  'simcell-capability',
  'map-download',
  'map-area',
])
export type JobKind = z.infer<typeof JobKind>

export const JobStatus = z.enum(['queued', 'running', 'paused', 'done', 'error', 'cancelled'])
export type JobStatus = z.infer<typeof JobStatus>

export const JobAwaiting = z.object({
  kind: z.literal('cloud-approval'),
  requestId: z.string(),
})
export type JobAwaiting = z.infer<typeof JobAwaiting>

export const Job = z.object({
  id: Id,
  kind: JobKind,
  status: JobStatus,
  projectPath: z.string().optional(),
  scenarioId: Id.optional(),
  progress: z.number().min(0).max(1).default(0),
  message: z.string().default(''),
  payload: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** Resumable after app restart (has checkpoints). */
  resumable: z.boolean().default(false),
  /**
   * The job is paused in place until the user approves a cloud request (#433). The status stays
   * `running` so older builds still read jobs.json.
   */
  awaiting: JobAwaiting.optional(),
})
export type Job = z.infer<typeof Job>

export const JobProgressEvent = z.object({
  jobId: Id,
  kind: JobKind,
  status: JobStatus,
  progress: z.number().min(0).max(1),
  message: z.string(),
  stage: z.string().optional(),
  itemId: z.string().optional(),
  /** Set while the job waits for a cloud approval (#433); absent otherwise. */
  awaiting: JobAwaiting.optional(),
})
export type JobProgressEvent = z.infer<typeof JobProgressEvent>

/** Streamed LLM tokens for the live generation log. */
export const JobTokenEvent = z.object({
  jobId: Id,
  stage: z.string(),
  itemId: z.string().optional(),
  text: z.string(),
})
export type JobTokenEvent = z.infer<typeof JobTokenEvent>

export const JobDoneEvent = z.object({
  jobId: Id,
  kind: JobKind,
  status: z.enum(['done', 'error', 'cancelled']),
  result: z.unknown().optional(),
  error: z.string().optional(),
})
export type JobDoneEvent = z.infer<typeof JobDoneEvent>
