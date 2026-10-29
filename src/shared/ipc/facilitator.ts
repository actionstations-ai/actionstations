import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { HotwashItemKind } from '../schemas/aar'
import { ComplianceSession } from '../schemas/compliance'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })

/**
 * scenarios/<id>/facilitator.json. A loose object (ADR-0016): live play (#418), controller tools
 * (#428) and other features each add one optional top-level key, and a key this build does not
 * know survives a save by it, so two builds can share the file.
 */
export const FacilitatorState = z.looseObject({
  /** Exercise clock: minutes elapsed when last paused/started, plus wall-clock anchor. */
  elapsedMin: z.number().nonnegative().default(0),
  runningSince: z.string().optional(),
  delivered: z
    .record(z.string(), z.object({ at: z.string(), exerciseTime: z.string() }))
    .default({}),
  notes: z.record(z.string(), z.string()).default({}),
  generalNotes: z.string().default(''),
  /**
   * Hot wash 3-Up / 3-Down items captured in the room (#419, FR-3): the same vocabulary as the
   * live `hotwash.item` message, so an exercise without live play still produces evidence.
   */
  hotwash: z
    .array(
      z.object({
        id: SafeId,
        kind: HotwashItemKind,
        text: z.string().max(4000),
        objectiveRef: z.string().max(128).optional(),
        rowId: z.string().max(64).optional(),
        at: z.string(),
      }),
    )
    .default([]),
  /** Decision log (#419, FR-3): what was decided, when, by which role (never a person). */
  decisions: z
    .array(
      z.object({
        id: SafeId,
        at: z.string(),
        exerciseTime: z.string().max(8).optional(),
        rowId: z.string().max(64).optional(),
        text: z.string().max(4000),
        /** Role id, never a name. */
        byRole: z.string().max(128).optional(),
      }),
    )
    .default([]),
  /** Regulatory clocks: triggers fired, clocks filed or waived, clocks on screen (#426). */
  compliance: ComplianceSession.optional(),
})
export type FacilitatorState = z.infer<typeof FacilitatorState>
export type FacilitatorHotwashItem = FacilitatorState['hotwash'][number]
export type FacilitatorDecision = FacilitatorState['decisions'][number]

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
