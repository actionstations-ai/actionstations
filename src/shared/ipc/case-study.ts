// casestudy:* (spec 0452 FR-9): unfolding case studies for nursing education. Authoring, import
// with an identifier check, drafts from a named clinical trajectory and the author's review that
// releases a case to learners. Cases and answers stay in the project folder.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { CaseStudy, CaseStudyListItem } from '../schemas/case-study'

const P = z.object({ projectPath: z.string().min(1) })

export const CASE_TRAJECTORY_KINDS = [
  'sepsis',
  'hemorrhage',
  'respiratory_failure',
  'cardiac_event',
  'postoperative_deterioration',
  'hypoglycemia',
] as const

export const IdentifierWarning = z.object({
  path: z.string(),
  kind: z.string(),
  text: z.string(),
})
export type IdentifierWarning = z.infer<typeof IdentifierWarning>

export const caseStudyChannels = {
  'casestudy:list': channel(P, z.array(CaseStudyListItem)),
  'casestudy:get': channel(P.extend({ id: SafeId }), CaseStudy),
  /** Save an edit; editing a reviewed case sends it back to draft. */
  'casestudy:save': channel(P.extend({ study: CaseStudy }), CaseStudy),
  'casestudy:delete': channel(P.extend({ id: SafeId }), z.object({})),
  /** A draft built from a named trajectory (simulated, deterministic for the seed). */
  'casestudy:draft': channel(
    P.extend({
      kind: z.enum(CASE_TRAJECTORY_KINDS),
      seed: z.number().int().min(0).max(1_000_000).default(1),
      startLabel: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      contentNotice: z.string().max(500).optional(),
    }),
    CaseStudy,
  ),
  /**
   * Import a case from JSON text. With direct identifiers in the text nothing is saved until the
   * author redacts them or says they are not identifiers; `warnings` lists what was found.
   */
  'casestudy:import': channel(
    P.extend({
      json: z.string().max(5_000_000),
      redact: z.boolean().optional(),
      acknowledge: z.boolean().optional(),
    }),
    z.object({ saved: z.boolean(), id: SafeId.optional(), warnings: z.array(IdentifierWarning) }),
  ),
  /** The author's review: records who reviewed and releases the case to learners. */
  'casestudy:review': channel(
    P.extend({ id: SafeId, by: z.string().min(1).max(120), note: z.string().max(500).default('') }),
    CaseStudy,
  ),
}
