// redlines:* and drills:* (#431): proposed plan edits from an AAR/IP, their export as tracked
// changes or a change memo, and regression drills with their recorded runs.
import { z } from 'zod'
import { channel } from './define'
import { Drill, DrillPlan } from '../schemas/drill'
import { NewRedline, Redline, RedlineExportResult } from '../schemas/redline'
import { SafeId } from '../schemas/common'

const P = z.object({ projectPath: z.string().min(1) })
const JobStarted = z.object({ jobId: SafeId })

export const RedlinePreview = z.object({
  mode: z.enum(['tracked', 'memo']),
  reason: z.string().optional(),
})
export type RedlinePreview = z.infer<typeof RedlinePreview>

export const redlineChannels = {
  'redlines:list': channel(
    P.extend({ scenarioId: SafeId.optional(), documentId: SafeId.optional() }),
    z.array(Redline),
  ),
  'redlines:get': channel(P.extend({ id: SafeId }), Redline),
  /** Draft proposals for areas for improvement of a scenario's AAR/IP (job 'generate-redlines'). */
  'redlines:generate': channel(
    P.extend({
      scenarioId: SafeId,
      findingIds: z.array(SafeId).min(1).max(100),
      instructions: z.string().max(2000).optional(),
    }),
    JobStarted,
  ),
  /** A proposal written by hand from selected plan text (FR-3). */
  'redlines:create': channel(P.extend({ redline: NewRedline }), Redline),
  'redlines:update': channel(
    P.extend({
      id: SafeId,
      patch: z.object({
        proposedText: z.string().min(1).max(20_000).optional(),
        rationale: z.string().max(2000).optional(),
      }),
    }),
    Redline,
  ),
  'redlines:set-status': channel(
    P.extend({
      ids: z.array(SafeId).min(1).max(200),
      to: z.enum(['accepted', 'rejected', 'proposed']),
      note: z.string().max(1000).default(''),
    }),
    z.array(Redline),
  ),
  'redlines:delete': channel(P.extend({ id: SafeId }), z.void()),
  /** Export accepted proposals (job 'redline-export'); the result is the job's result. */
  'redlines:export': channel(
    P.extend({
      ids: z.array(SafeId).min(1).max(200),
      /** Empty means <project>/exports. */
      outDir: z.string().max(2000).default(''),
      formats: z.array(z.enum(['docx', 'pdf'])).default(['docx']),
    }),
    JobStarted,
  ),
  /** Whether a proposal can be marked in the plan's own file, or goes to the memo. */
  'redlines:preview-tracked': channel(P.extend({ id: SafeId }), RedlinePreview),
  /** FR-7: check the redlines of the plan this document replaces against its text. */
  'redlines:check-applied': channel(P.extend({ documentId: SafeId }), z.array(Redline)),

  'drills:list': channel(P, z.array(Drill)),
  'drills:get': channel(P.extend({ id: SafeId }), Drill),
  /** A proposed drill from a session's ratings; nothing is written. */
  'drills:draft': channel(
    P.extend({ scenarioId: SafeId, sessionId: SafeId.optional() }),
    DrillPlan,
  ),
  'drills:save': channel(P.extend({ drill: DrillPlan.extend({ id: SafeId.optional() }) }), Drill),
  /** Build the drill's scenario (job 'build-drill'). */
  'drills:build-scenario': channel(P.extend({ id: SafeId }), JobStarted),
  /** Read the drill scenario's ratings and record a run (FR-10). */
  'drills:record-run': channel(P.extend({ id: SafeId, sessionId: SafeId.optional() }), Drill),
  /** FR-11: write a run's verdicts to the linked program's corrective actions. */
  'drills:record-program': channel(
    P.extend({ id: SafeId, runId: SafeId, programPath: z.string().min(1) }),
    Drill,
  ),
  /** drill-results.csv and the one-page results PDF (job 'drill-export'). */
  'drills:export-results': channel(
    P.extend({ id: SafeId, outDir: z.string().max(2000).default('') }),
    JobStarted,
  ),
  'drills:delete': channel(P.extend({ id: SafeId }), z.void()),
}

export { RedlineExportResult }
