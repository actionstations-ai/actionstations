// microdrills:* (#437): short drills built from one plan annex, run on this computer, with
// prewritten graded hints. Not the regression drills of #431 (drills:*).
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import {
  HintLevel,
  MicroDrill,
  MicroDrillDebrief,
  MicroDrillListItem,
  MicroDrillRun,
  MicroDrillSettings,
} from '../schemas/micro-drill'

const P = z.object({ projectPath: z.string().min(1) })

export const MicroDrillAnnexOption = z.object({
  headingPath: z.string(),
  tokens: z.number().int(),
  page: z.number().int().positive().optional(),
  tooLarge: z.boolean(),
})
export type MicroDrillAnnexOption = z.infer<typeof MicroDrillAnnexOption>

export const MicroDrillHint = z.object({
  level: HintLevel,
  text: z.string(),
  headingPath: z.string().optional(),
  page: z.number().int().positive().optional(),
  quote: z.string().optional(),
})
export type MicroDrillHint = z.infer<typeof MicroDrillHint>

export const microDrillChannels = {
  'microdrills:list': channel(P, z.array(MicroDrillListItem)),
  /** Headings of a document with the size of the section under each (FR-1). */
  'microdrills:annexes': channel(P.extend({ documentId: SafeId }), z.array(MicroDrillAnnexOption)),
  /** Build a draft drill from one annex (job 'build-micro-drill'). */
  'microdrills:build': channel(
    P.extend({
      documentId: SafeId,
      headingPath: z.string().min(1).max(500),
      settings: MicroDrillSettings,
    }),
    z.object({ jobId: SafeId }),
  ),
  /**
   * Build one draft drill per plan section the scenario's overview says it tests (FR-7), up to
   * five. The job result is `{ drillIds, skipped }`.
   */
  'microdrills:from-scenario': channel(
    P.extend({ scenarioId: SafeId, settings: MicroDrillSettings }),
    z.object({ jobId: SafeId }),
  ),
  'microdrills:get': channel(P.extend({ id: SafeId }), MicroDrill),
  /** Save an edit: the build checks run again; Ready needs no open problems or an override. */
  'microdrills:save': channel(P.extend({ drill: MicroDrill }), MicroDrill),
  'microdrills:delete': channel(P.extend({ id: SafeId }), z.object({})),
  /** Take participant names off every run of a drill. */
  'microdrills:remove-names': channel(P.extend({ id: SafeId }), z.object({ removed: z.number() })),
  'microdrills:runs': channel(P.extend({ drillId: SafeId.optional() }), z.array(MicroDrillRun)),
  'microdrills:run-start': channel(
    P.extend({
      drillId: SafeId,
      participants: z
        .array(z.object({ label: z.string().max(40), name: z.string().max(80).optional() }))
        .max(6)
        .default([]),
    }),
    MicroDrillRun,
  ),
  'microdrills:run-get': channel(P.extend({ runId: SafeId }), MicroDrillRun),
  'microdrills:answer': channel(
    P.extend({
      runId: SafeId,
      stepId: SafeId,
      participantLabel: z.string().max(40),
      text: z.string().max(4000),
      ticked: z.array(SafeId).max(6).optional(),
    }),
    z.object({ run: MicroDrillRun, hintOffer: HintLevel.nullable() }),
  ),
  /** The next prewritten hint of a step; the model writes no hints at run time (FR-10). */
  'microdrills:hint': channel(
    P.extend({ runId: SafeId, stepId: SafeId }),
    z.object({ run: MicroDrillRun, hint: MicroDrillHint }),
  ),
  'microdrills:run-finish': channel(
    P.extend({ runId: SafeId, pausedSec: z.number().min(0).max(86_400) }),
    MicroDrillRun,
  ),
  'microdrills:debrief': channel(P.extend({ runId: SafeId }), MicroDrillDebrief),
  /** Write the debrief as a PDF in <project>/exports (job-free: one page). */
  'microdrills:debrief-pdf': channel(P.extend({ runId: SafeId }), z.object({ path: z.string() })),
}
