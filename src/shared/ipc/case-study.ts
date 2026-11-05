// casestudy:* (spec 0452 FR-9): unfolding case studies for nursing education. Authoring, import
// with an identifier check, drafts from a named clinical trajectory and the author's review that
// releases a case to learners. Cases and answers stay in the project folder.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import {
  CaseStudy,
  CaseStudyListItem,
  CaseStudyResponse,
  CaseStudyRun,
  CjmmStep,
  StepScore,
} from '../schemas/case-study'

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

export const PlayView = z.object({
  run: CaseStudyRun,
  study: z.object({
    id: SafeId,
    title: z.string(),
    patientSummary: z.string(),
    objectives: z.array(z.string()),
    contentNotice: z.string().optional(),
  }),
  stage: z.object({
    id: SafeId,
    title: z.string(),
    time: z.string(),
    narrative: z.string(),
    figures: z.array(
      z.object({
        name: z.string(),
        kind: z.string(),
        svg: z.string(),
        summary: z.string(),
        table: z
          .object({
            caption: z.string().optional(),
            columns: z.array(z.string()),
            rows: z.array(z.array(z.string())),
          })
          .optional(),
      }),
    ),
    tables: z.array(
      z.object({
        caption: z.string(),
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
      }),
    ),
    statements: z.array(z.object({ speaker: z.string(), text: z.string() })),
    prompts: z.array(
      z.object({
        id: SafeId,
        step: CjmmStep,
        stepLabel: z.string(),
        type: z.enum([
          'select_cues',
          'rank_hypotheses',
          'choose_actions',
          'rationale',
          'evaluate_outcome',
        ]),
        text: z.string(),
        options: z.array(z.object({ id: SafeId, text: z.string() })).optional(),
      }),
    ),
  }),
  stageNumber: z.number().int(),
  feedback: z.array(
    z.object({
      promptId: SafeId,
      response: CaseStudyResponse,
      score: z.number(),
      rationale: z.string(),
      bestAnswer: z.string(),
    }),
  ),
  canAdvance: z.boolean(),
  finished: z.boolean(),
  profile: z.array(StepScore),
  overall: z.number().int().nullable(),
  notes: z.object({ score: z.string(), privacy: z.string() }),
})
export type PlayView = z.infer<typeof PlayView>

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
  /** Start a run. A learner gets only reviewed cases; `preview` lets the author try a draft. */
  'casestudy:run-start': channel(
    P.extend({
      caseId: SafeId,
      mode: z.enum(['individual', 'group']),
      learner: z.string().max(80).optional(),
      acknowledged: z.boolean(),
      preview: z.boolean().optional(),
    }),
    z.object({ runId: SafeId }),
  ),
  /** The current stage of a run, without keys; rationales appear once a prompt is answered. */
  'casestudy:play': channel(P.extend({ runId: SafeId }), PlayView),
  'casestudy:run-answer': channel(
    P.extend({
      runId: SafeId,
      promptId: SafeId,
      response: CaseStudyResponse,
      preVotes: z
        .array(z.object({ member: z.string().max(60), response: CaseStudyResponse }))
        .max(8)
        .optional(),
    }),
    PlayView,
  ),
  /** Move to the next stage (or finish) once every prompt of the stage is answered. */
  'casestudy:run-advance': channel(P.extend({ runId: SafeId }), PlayView),
  'casestudy:runs': channel(P.extend({ caseId: SafeId.optional() }), z.array(CaseStudyRun)),
}
