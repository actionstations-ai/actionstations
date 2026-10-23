import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })

export const FacilitatorState = z.object({
  /** Exercise clock: minutes elapsed when last paused/started, plus wall-clock anchor. */
  elapsedMin: z.number().nonnegative().default(0),
  runningSince: z.string().optional(),
  delivered: z
    .record(z.string(), z.object({ at: z.string(), exerciseTime: z.string() }))
    .default({}),
  notes: z.record(z.string(), z.string()).default({}),
  generalNotes: z.string().default(''),
})
export type FacilitatorState = z.infer<typeof FacilitatorState>

export const facilitatorChannels = {
  'facilitator:state-get': channel(S, FacilitatorState),
  'facilitator:state-save': channel(S.extend({ state: FacilitatorState }), FacilitatorState),
  'facilitator:displays': channel(
    z.void(),
    z.array(
      z.object({
        id: z.number(),
        label: z.string(),
        primary: z.boolean(),
        width: z.number(),
        height: z.number(),
      }),
    ),
  ),
  'facilitator:present': channel(
    S.extend({
      injectId: SafeId,
      assetId: SafeId.optional(),
      displayId: z.number().optional(),
    }),
    z.void(),
  ),
  'facilitator:close-present': channel(z.void(), z.void()),
  /** Whether the presentation window is open (changes arrive as facilitator:present-changed). */
  'facilitator:present-status': channel(z.void(), z.object({ open: z.boolean() })),
}

export const PresentChangedEvent = z.object({ open: z.boolean() })
