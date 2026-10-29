// Plan check (#423): places where two of the organization's plans disagree, and references to
// plans or annexes that were never ingested. Saved to <project>/plan-conflicts.json; #427 reads it.
import { z } from 'zod'
import { Id, IsoDateTime } from './common'

export const PlanPassage = z.object({
  documentId: Id,
  documentTitle: z.string(),
  headingPath: z.string(),
  page: z.number().int().positive().optional(),
  chunkId: z.number().int(),
  /** The statement's exact text. */
  span: z.string(),
})
export type PlanPassage = z.infer<typeof PlanPassage>

export const PlanFindingVerdict = z.enum([
  'contradicts',
  'consistent',
  'complementary',
  'unrelated',
  'unconfirmed',
])
export type PlanFindingVerdict = z.infer<typeof PlanFindingVerdict>

export const PlanFindingStatus = z.enum(['open', 'dismissed', 'confirmed', 'outdated'])
export type PlanFindingStatus = z.infer<typeof PlanFindingStatus>

export const PlanFinding = z.object({
  /** sha256(slot + spanA + spanB), 16 hex. */
  id: z.string().regex(/^[0-9a-f]{16}$/),
  kind: z.enum(['contradiction', 'dangling_reference']),
  /** "release_approver", "notify_deadline", … */
  slot: z.string(),
  /** "Who approves public releases" */
  slotLabel: z.string(),
  subject: z.string(),
  a: PlanPassage,
  /** Absent for a dangling reference. */
  b: PlanPassage.optional(),
  values: z.tuple([z.string(), z.string()]).optional(),
  /** Dangling reference: the plan, annex or section that matches no document. */
  missingTarget: z.string().optional(),
  verdict: PlanFindingVerdict,
  verdictQuotes: z.object({ a: z.string(), b: z.string() }).optional(),
  explanation: z.string().optional(),
  status: PlanFindingStatus.default('open'),
  note: z.string().max(1000).optional(),
  foundAt: IsoDateTime,
})
export type PlanFinding = z.infer<typeof PlanFinding>

export const PlanConflictsFile = z.looseObject({
  formatVersion: z.literal(1).default(1),
  checkedAt: IsoDateTime,
  /** What the run saw. */
  documents: z.array(z.object({ id: Id, sha256: z.string() })).default([]),
  /** Run counts for the job log and the panel: candidates found, sent to the model, skipped. */
  stats: z
    .object({
      candidates: z.number().int().nonnegative(),
      sent: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
    })
    .optional(),
  findings: z.array(PlanFinding).default([]),
})
export type PlanConflictsFile = z.infer<typeof PlanConflictsFile>

/** Verdicts that are listed; consistent / unrelated stay in the file so a re-run does not re-ask. */
export const LISTED_VERDICTS: readonly PlanFindingVerdict[] = [
  'contradicts',
  'complementary',
  'unconfirmed',
]
