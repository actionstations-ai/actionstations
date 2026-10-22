// The binding sidecar stored next to each workflow: <id>.bindings.json.
import { z } from 'zod'
import { MediaType, WorkflowBinding } from '@shared/ipc/comfy'

export const WorkflowSidecar = z.object({
  name: z.string().min(1),
  mediaType: MediaType,
  description: z.string().default(''),
  bindings: z.array(WorkflowBinding).default([]),
  /** Prompt suffix per MediaBrief.imageStyle (phone, press, cctv, screen, portrait). */
  styles: z.record(z.string(), z.string()).optional(),
  /** Negative prompt used when the brief has none. */
  negativePrompt: z.string().optional(),
  /** Frames per second of the video the workflow writes (for durationSec → frames). */
  fps: z.number().positive().optional(),
  /** Frame count granularity: length = step·n + 1 (Wan 2.2 = 4, LTX-Video = 8). */
  frameStep: z.number().int().positive().optional(),
  /** Longest clip the workflow should produce. */
  maxDurationSec: z.number().positive().optional(),
})
export type WorkflowSidecar = z.infer<typeof WorkflowSidecar>
