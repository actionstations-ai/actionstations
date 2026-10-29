// Tracker report (spec 0428 FR-18): per-row response times and commitment outcomes with cite
// keys, for the after-action draft (#419) and the exports.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'

export const TrackerReport = z.object({
  responses: z.array(
    z.object({
      cite: z.string(),
      rowId: z.string(),
      responseMin: z.number(),
      note: z.string(),
      source: z.string(),
    }),
  ),
  /** Delivered rows that expect an answer and have none. */
  unanswered: z.array(z.string()),
  commitments: z.array(
    z.object({
      cite: z.string(),
      text: z.string(),
      owner: z.string(),
      status: z.enum(['open', 'kept', 'missed', 'dropped']),
      dueAtMin: z.number().optional(),
    }),
  ),
})

export const trackerChannels = {
  'tracker:report': channel(
    z.object({ projectPath: z.string().min(1), scenarioId: SafeId }),
    TrackerReport,
  ),
}
