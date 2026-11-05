// Unfolding case studies (spec 0452 FR-9, FR-10): one synthetic patient's story in ordered stages.
// Each stage brings new data (figures, tables, statements) and prompts tagged with a step of the
// Clinical Judgment Measurement Model; the next stage can depend on the learner's score on a
// prompt (spec 0430 style branching, by threshold). Every prompt has a key, partial credit and a
// rationale shown after answering. The score is this app's own scale: it makes no claim of
// equivalence to NCLEX scoring and the toolkit does not reproduce NCLEX items. A generated case
// stays a draft until the author reviews it. Stored as <project>/case-studies/<id>.json and
// <project>/case-study-runs/<id>.json; loose files, ignored by older versions (ADR-0016).
import { z } from 'zod'
import { IsoDateTime, SafeId } from './common'

/** The six cognitive operations of the NCSBN Clinical Judgment Measurement Model. */
export const CJMM_STEPS = [
  'recognize_cues',
  'analyze_cues',
  'prioritize_hypotheses',
  'generate_solutions',
  'take_action',
  'evaluate_outcomes',
] as const
export const CjmmStep = z.enum(CJMM_STEPS)
export type CjmmStep = z.infer<typeof CjmmStep>

export const CJMM_LABELS: Record<CjmmStep, string> = {
  recognize_cues: 'Recognize cues',
  analyze_cues: 'Analyze cues',
  prioritize_hypotheses: 'Prioritize hypotheses',
  generate_solutions: 'Generate solutions',
  take_action: 'Take action',
  evaluate_outcomes: 'Evaluate outcomes',
}

export const CASE_STUDY_SCORE_NOTE =
  'Scores use this app’s own scale for practice. They are not NCLEX scores and make no claim of equivalence to them.'

export const CASE_STUDY_PRIVACY_NOTE =
  'Your instructor can see your answers when you use a connected class session. Otherwise your answers stay on this computer.'

const Text = (max: number) => z.string().max(max)
const Option = z.object({ id: SafeId, text: Text(400) })

/** What the learner sees at a stage besides the prompts. */
export const CaseStudyData = z.object({
  /** Figures drawn by the clinical care figure kinds: { name: { kind, data } }. */
  figures: z
    .record(
      z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      z.object({ kind: z.string().max(60), data: z.unknown() }),
    )
    .default({}),
  tables: z
    .array(
      z.object({
        caption: Text(200),
        columns: z.array(Text(60)).min(1).max(12),
        rows: z.array(z.array(Text(200))).max(40),
      }),
    )
    .max(6)
    .default([]),
  /** What the patient, a family member or a provider says. */
  statements: z
    .array(z.object({ speaker: Text(80), text: Text(600) }))
    .max(6)
    .default([]),
})
export type CaseStudyData = z.infer<typeof CaseStudyData>

const PromptBase = z.object({
  id: SafeId,
  step: CjmmStep,
  text: Text(800),
  /** Shown after the learner answers. */
  rationale: Text(1500),
  /** The next stage depends on this prompt's score (the last such prompt of a stage decides). */
  branch: z
    .object({
      threshold: z.number().min(0).max(1),
      passTo: SafeId.optional(),
      failTo: SafeId.optional(),
    })
    .optional(),
})

export const SelectCuesPrompt = PromptBase.extend({
  type: z.literal('select_cues'),
  options: z.array(Option).min(2).max(14),
  /** Option ids that are relevant cues. */
  key: z.object({ relevant: z.array(SafeId).min(1) }),
})
export const RankHypothesesPrompt = PromptBase.extend({
  type: z.literal('rank_hypotheses'),
  options: z.array(Option).min(2).max(8),
  /** Option ids from most to least likely. */
  key: z.object({ order: z.array(SafeId).min(2) }),
})
export const ChooseActionsPrompt = PromptBase.extend({
  type: z.literal('choose_actions'),
  options: z.array(Option).min(2).max(12),
  /** Credit per option: 1 best, a fraction acceptable, 0 neutral, negative harmful. */
  key: z.object({ credit: z.record(SafeId, z.number().min(-1).max(1)) }),
})
export const RationalePrompt = PromptBase.extend({
  type: z.literal('rationale'),
  /** Short free text, scored by the author's key points: any one phrase of a group counts it. */
  key: z.object({
    points: z
      .array(z.object({ label: Text(200), anyOf: z.array(Text(80)).min(1).max(10) }))
      .min(1)
      .max(8),
  }),
})
export const EvaluateOutcomePrompt = PromptBase.extend({
  type: z.literal('evaluate_outcome'),
  options: z.array(Option).min(2).max(6),
  key: z.object({ credit: z.record(SafeId, z.number().min(0).max(1)) }),
})
export const CaseStudyPrompt = z.discriminatedUnion('type', [
  SelectCuesPrompt,
  RankHypothesesPrompt,
  ChooseActionsPrompt,
  RationalePrompt,
  EvaluateOutcomePrompt,
])
export type CaseStudyPrompt = z.infer<typeof CaseStudyPrompt>

export const CaseStudyStage = z.object({
  id: SafeId,
  title: Text(200),
  /** The clock time or elapsed time of the stage, for display. */
  time: Text(40).default(''),
  narrative: Text(2000),
  data: CaseStudyData.default({ figures: {}, tables: [], statements: [] }),
  prompts: z.array(CaseStudyPrompt).min(1).max(8),
  /** The stage after this one when no branch decides; absent means the case ends here. */
  next: SafeId.optional(),
})
export type CaseStudyStage = z.infer<typeof CaseStudyStage>

export const CaseStudyReview = z.object({
  by: Text(120).min(1),
  at: IsoDateTime,
  note: Text(500).default(''),
})
export type CaseStudyReview = z.infer<typeof CaseStudyReview>

export const CaseStudy = z
  .object({
    id: SafeId,
    title: Text(200).min(1),
    origin: z.enum(['authored', 'imported', 'generated']),
    /** A generated or imported case is a draft until the author reviews it; learners get only reviewed cases. */
    status: z.enum(['draft', 'reviewed']).default('draft'),
    review: CaseStudyReview.optional(),
    /** A content notice for cases with death, violence or harm to children; learners can opt out. */
    contentNotice: Text(500).optional(),
    patient: z.object({
      simulated: z.literal(true),
      name: Text(120),
      mrn: Text(40),
      age: z.number().int().min(0).max(120),
      sex: z.enum(['F', 'M']),
      summary: Text(1200),
    }),
    objectives: z.array(Text(300)).max(10).default([]),
    /** Where the data comes from (trajectory, source of an imported case), cited on the case. */
    source: Text(400).default(''),
    stages: z.array(CaseStudyStage).min(1).max(20),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .superRefine((c, ctx) => {
    const stageIds = new Set(c.stages.map((s) => s.id))
    if (stageIds.size !== c.stages.length)
      ctx.addIssue({ code: 'custom', path: ['stages'], message: 'Stage ids must be unique' })
    c.stages.forEach((s, si) => {
      if (s.next && !stageIds.has(s.next))
        ctx.addIssue({
          code: 'custom',
          path: ['stages', si, 'next'],
          message: `Unknown stage ${s.next}`,
        })
      const promptIds = new Set<string>()
      s.prompts.forEach((p, pi) => {
        if (promptIds.has(p.id))
          ctx.addIssue({
            code: 'custom',
            path: ['stages', si, 'prompts', pi, 'id'],
            message: 'Duplicate prompt id',
          })
        promptIds.add(p.id)
        for (const to of [p.branch?.passTo, p.branch?.failTo])
          if (to && !stageIds.has(to))
            ctx.addIssue({
              code: 'custom',
              path: ['stages', si, 'prompts', pi, 'branch'],
              message: `Unknown stage ${to}`,
            })
        if ('options' in p) {
          const optionIds = new Set(p.options.map((o) => o.id))
          const keyed =
            p.type === 'select_cues'
              ? p.key.relevant
              : p.type === 'rank_hypotheses'
                ? p.key.order
                : Object.keys(p.key.credit)
          for (const id of keyed)
            if (!optionIds.has(id))
              ctx.addIssue({
                code: 'custom',
                path: ['stages', si, 'prompts', pi, 'key'],
                message: `Key names unknown option ${id}`,
              })
          if (p.type === 'rank_hypotheses' && new Set(p.key.order).size !== p.options.length)
            ctx.addIssue({
              code: 'custom',
              path: ['stages', si, 'prompts', pi, 'key'],
              message: 'The ranking key must list every option once',
            })
        }
      })
    })
    if (c.status === 'reviewed' && !c.review)
      ctx.addIssue({
        code: 'custom',
        path: ['review'],
        message: 'A reviewed case needs its review record',
      })
  })
export type CaseStudy = z.infer<typeof CaseStudy>

// ---- runs ----------------------------------------------------------------------------------

/** One answer: option ids (cues, actions, outcome), an ordered id list (ranking) or text. */
export const CaseStudyResponse = z.union([z.array(SafeId).max(14), z.string().max(2000)])
export type CaseStudyResponse = z.infer<typeof CaseStudyResponse>

export const CaseStudyAnswer = z.object({
  stageId: SafeId,
  promptId: SafeId,
  step: CjmmStep,
  response: CaseStudyResponse,
  /** 0 to 1 on this app's scale. */
  score: z.number().min(0).max(1),
  /** Each member's own answer before the group agreed, for a group run. */
  preVotes: z
    .array(z.object({ member: Text(60), response: CaseStudyResponse }))
    .max(8)
    .optional(),
  answeredAt: IsoDateTime,
})
export type CaseStudyAnswer = z.infer<typeof CaseStudyAnswer>

export const CaseStudyRun = z.object({
  id: SafeId,
  caseId: SafeId,
  mode: z.enum(['individual', 'group']),
  /** Optional and local by default; never required. */
  learner: Text(80).optional(),
  /** The learner saw the privacy note and the content notice before starting. */
  acknowledged: z.boolean(),
  /** The author is trying a case that is still a draft; preview runs are never counted. */
  preview: z.boolean().default(false),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.optional(),
  stageId: SafeId,
  /** Stages visited, in order. */
  path: z.array(SafeId).max(40),
  answers: z.array(CaseStudyAnswer).max(200),
})
export type CaseStudyRun = z.infer<typeof CaseStudyRun>

export const StepScore = z.object({
  step: CjmmStep,
  label: z.string(),
  prompts: z.number().int(),
  earned: z.number(),
  percent: z.number().int().nullable(),
})
export type StepScore = z.infer<typeof StepScore>

export const CaseStudyListItem = z.object({
  id: SafeId,
  title: z.string(),
  origin: z.enum(['authored', 'imported', 'generated']),
  status: z.enum(['draft', 'reviewed']),
  stages: z.number().int(),
  prompts: z.number().int(),
  contentNotice: z.string().optional(),
})
export type CaseStudyListItem = z.infer<typeof CaseStudyListItem>
