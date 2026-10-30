// Micro-drills (#437): 15-minute practice on one annex of one plan, for one person or a small
// team. A drill is built once (questions, expected points, three prewritten hints per step) and
// reviewed before it is Ready; a run records the answers, which hints were used and the score.
// Stored as <project>/micro-drills/<id>.json and <project>/micro-drill-runs/<id>.json. Not the
// regression drills of #431 (schemas/drill.ts), which rerun failed injects after a plan change.
import { z } from 'zod'
import { CoreCapabilityId } from '../core-capabilities'
import { Id, IsoDateTime, SafeId } from './common'

export const MICRO_DRILL_LIMITS = {
  /** An annex larger than this (tokens) is refused: pick a narrower section. */
  annexTokens: 12_000,
  participants: 6,
  runs: 500,
} as const

export const MICRO_DRILL_NOTICE =
  'This drill is practice. Results show which plan sections need review; they are not a measure of individual performance.'
export const MICRO_DRILL_EVIDENCE_NOTE =
  'The evidence for short drills with graded hints is thin: the one study we know of had four students and measured intention to use, not learning. Treat results as a prompt to review the plan, not as proof that anyone has learned it.'

export const MicroDrillCitation = z.object({
  documentId: Id,
  documentTitle: z.string().max(300),
  headingPath: z.string().max(500),
  page: z.number().int().positive().optional(),
  chunkId: z.number().int(),
})
export type MicroDrillCitation = z.infer<typeof MicroDrillCitation>

export const HintLevel = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type HintLevel = z.infer<typeof HintLevel>

export const MicroDrillStep = z.object({
  id: SafeId,
  prompt: z.string().max(1200),
  expectedPoints: z
    .array(z.object({ id: SafeId, text: z.string().max(300), citation: MicroDrillCitation }))
    .min(1)
    .max(6),
  /** Written when the drill is built and reviewed before it is Ready; never written at run time. */
  hints: z.tuple([
    z.object({ level: z.literal(1), text: z.string().max(300) }),
    z.object({ level: z.literal(2), text: z.string().max(300), citation: MicroDrillCitation }),
    z.object({
      level: z.literal(3),
      text: z.string().max(600),
      citation: MicroDrillCitation,
      quote: z.string().max(600),
    }),
  ]),
  modelAnswer: z.string().max(1200),
})
export type MicroDrillStep = z.infer<typeof MicroDrillStep>

export const MicroDrillLintIssue = z.object({
  code: z.string().max(60),
  stepId: SafeId.optional(),
  message: z.string().max(400),
})
export type MicroDrillLintIssue = z.infer<typeof MicroDrillLintIssue>

export const MicroDrillSettings = z.object({
  audience: z.enum(['new_staff', 'refresher']).default('new_staff'),
  durationMin: z.union([z.literal(10), z.literal(15), z.literal(20)]).default(15),
  mode: z.enum(['solo', 'team']).default('solo'),
  stepCount: z.number().int().min(3).max(5).default(4),
  focus: z.string().max(200).default(''),
})
export type MicroDrillSettings = z.infer<typeof MicroDrillSettings>

const Annex = z.object({
  documentId: Id,
  documentTitle: z.string().max(300),
  headingPath: z.string().max(500),
  page: z.number().int().positive().optional(),
})

export const MicroDrill = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  version: z.number().int().default(1),
  title: z.string().min(1).max(120),
  status: z.enum(['draft', 'ready']).default('draft'),
  annex: Annex,
  audience: MicroDrillSettings.shape.audience,
  durationMin: MicroDrillSettings.shape.durationMin,
  mode: MicroDrillSettings.shape.mode,
  focus: z.string().max(200).default(''),
  situation: z.string().max(1500),
  objectives: z
    .array(
      z.object({ id: SafeId, text: z.string().max(300), capability: CoreCapabilityId.optional() }),
    )
    .min(1)
    .max(2),
  steps: z.array(MicroDrillStep).min(3).max(5),
  /** The user marked Ready although the build checks found problems. */
  lintOverridden: z.boolean().default(false),
  lint: z.array(MicroDrillLintIssue).max(100).default([]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type MicroDrill = z.infer<typeof MicroDrill>

export const MicroDrillAttempt = z.object({
  participantLabel: z.string().max(40),
  text: z.string().max(4000),
  at: IsoDateTime,
  covered: z.array(SafeId),
  partial: z.array(SafeId),
  missing: z.array(SafeId),
  followUp: z.string().max(400).optional(),
})
export type MicroDrillAttempt = z.infer<typeof MicroDrillAttempt>

export const MicroDrillRunStep = z.object({
  stepId: SafeId,
  attempts: z.array(MicroDrillAttempt).max(50).default([]),
  hintsUsed: z.array(HintLevel).max(20).default([]),
  /** Share of the step's points, after the hint reductions (0 to 1). */
  score: z.number().min(0).max(1).default(0),
})
export type MicroDrillRunStep = z.infer<typeof MicroDrillRunStep>

export const MicroDrillRun = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  drillId: Id,
  drillVersion: z.number().int(),
  drillTitle: z.string().max(120),
  annex: Annex,
  /** `player_page`: one device, one run, started from the facilitator's computer (FR-17). */
  where: z.enum(['this_computer', 'player_page']).default('this_computer'),
  participants: z
    .array(z.object({ label: z.string().max(40), name: z.string().max(80).optional() }))
    .min(1)
    .max(MICRO_DRILL_LIMITS.participants),
  /** `model`: a model checks answers. `checklist`: the participant ticks the points they covered. */
  assessment: z.enum(['model', 'checklist']),
  /** Why the run uses the checklist, when it does. */
  checklistReason: z.string().max(300).optional(),
  /** Misses before a hint is offered: `first_miss` or `second_miss` (fading). */
  hintRule: z.enum(['first_miss', 'second_miss']),
  /** Steps whose Level 3 hint is withdrawn because earlier runs needed no hints. */
  withdrawnLevel3: z.array(SafeId).default([]),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.optional(),
  pausedSec: z.number().min(0).default(0),
  steps: z.array(MicroDrillRunStep),
  coverage: z.number().min(0).max(1).optional(),
})
export type MicroDrillRun = z.infer<typeof MicroDrillRun>

/** annexKey → participant label → step id → what the latest runs needed. */
export const MicroDrillHintHistory = z.record(
  z.string(),
  z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        runs: z.number().int().min(0),
        /** Highest hint level used in the latest run (0 = none). */
        lastHintMax: z.number().int().min(0).max(3),
        /** Consecutive latest runs answered without any hint. */
        cleanRuns: z.number().int().min(0),
      }),
    ),
  ),
)
export type MicroDrillHintHistory = z.infer<typeof MicroDrillHintHistory>

/** The summary that goes to the program folder: no answers, no names (FR-20). */
export const MicroDrillSummary = z.object({
  drillId: Id,
  runId: Id,
  at: IsoDateTime,
  planSection: z.object({
    documentId: Id,
    documentTitle: z.string().max(300),
    headingPath: z.string().max(500),
    page: z.number().int().positive().optional(),
    documentSha256: z.string().max(100).optional(),
  }),
  coreCapabilities: z.array(CoreCapabilityId).max(8),
  participants: z.number().int().min(1).max(MICRO_DRILL_LIMITS.participants),
  minutes: z.number().min(0),
  coverage: z.number().min(0).max(1),
  hintsUsed: z.number().int().min(0),
})
export type MicroDrillSummary = z.infer<typeof MicroDrillSummary>

/** Header facts of a drill for the library list. */
export const MicroDrillListItem = z.object({
  id: Id,
  title: z.string(),
  status: z.enum(['draft', 'ready']),
  annex: Annex,
  durationMin: z.number(),
  mode: z.enum(['solo', 'team']),
  lintIssues: z.number().int(),
  runs: z.number().int(),
  lastRunAt: IsoDateTime.optional(),
})
export type MicroDrillListItem = z.infer<typeof MicroDrillListItem>

/** What the build prompt returns; sources are passage keys (P1…) mapped to chunks afterwards. */
export const MicroDrillBuildOutput = z.object({
  title: z.string().min(1).max(120),
  situation: z.string().min(1).max(1500),
  objectives: z
    .array(z.object({ text: z.string().min(1).max(300), capability: CoreCapabilityId.optional() }))
    .min(1)
    .max(2),
  steps: z
    .array(
      z.object({
        prompt: z.string().min(1).max(1200),
        expectedPoints: z
          .array(z.object({ text: z.string().min(1).max(300), source: z.string().max(20) }))
          .min(1)
          .max(6),
        hint1: z.string().min(1).max(300),
        hint2: z.object({ text: z.string().min(1).max(300), source: z.string().max(20) }),
        hint3: z.object({
          text: z.string().min(1).max(600),
          source: z.string().max(20),
          quote: z.string().min(1).max(600),
        }),
        modelAnswer: z.string().min(1).max(1200),
      }),
    )
    .min(3)
    .max(5),
})
export type MicroDrillBuildOutput = z.infer<typeof MicroDrillBuildOutput>

/** What the assessment prompt returns: only ids of the step's own expected points. */
export const MicroDrillAssessOutput = z.object({
  covered: z.array(z.string().max(60)).max(6),
  partial: z.array(z.string().max(60)).max(6),
  missing: z.array(z.string().max(60)).max(6),
  followUp: z.string().max(400).optional(),
})
export type MicroDrillAssessOutput = z.infer<typeof MicroDrillAssessOutput>

/** The end-of-run summary (FR-13): per question what was covered, what was missed, the model answer. */
export const MicroDrillDebrief = z.object({
  runId: Id,
  title: z.string(),
  annex: Annex,
  notice: z.string(),
  evidenceNote: z.string(),
  startedAt: IsoDateTime,
  minutes: z.number().min(0),
  plannedMinutes: z.number(),
  participants: z.array(z.string()),
  coverage: z.number().min(0).max(1),
  hintsUsed: z.number().int().min(0),
  assessment: z.enum(['model', 'checklist']),
  steps: z.array(
    z.object({
      id: SafeId,
      prompt: z.string(),
      hintsUsed: z.array(HintLevel),
      points: z.array(
        z.object({
          text: z.string(),
          status: z.enum(['covered', 'partial', 'missed']),
          headingPath: z.string(),
          page: z.number().int().positive().optional(),
        }),
      ),
      modelAnswer: z.string(),
    }),
  ),
  /** One line on what to review. */
  reviewLine: z.string(),
})
export type MicroDrillDebrief = z.infer<typeof MicroDrillDebrief>
