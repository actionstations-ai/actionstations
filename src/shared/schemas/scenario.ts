import { z } from 'zod'
import { ThreatFamilyId } from '../domains/schema'
import { Citation, ExerciseTime, Id, IsoDateTime, RelPath, WallClock } from './common'
import { Role } from './project'
import { ProviderRef } from './provider'
import { PurposeTag } from '../taxonomy'

export const ScenarioBrief = z.object({
  userPrompt: z.string().default(''),
  /** Audience roles / disciplines, e.g. ["Airport Operations", "IT/Cybersecurity", "PIO"]. */
  audience: z.array(z.string()).default([]),
  durationHours: z.number().positive().max(24).default(4),
  phaseCount: z.number().int().min(1).max(8).default(4),
  learningObjectives: z.array(z.string()).default([]),
  /** e.g. "must test TIRP §13 and ASP §6.4", "include one red herring per phase" */
  constraints: z.array(z.string()).default([]),
  /** Chosen idea when started from "Give me ideas". */
  ideaId: Id.optional(),
  /** Narrative start, e.g. "09:00". */
  startWallClock: WallClock.optional(),
  /**
   * The kind of incident (src/shared/domains threat families): sets the phase arc, the
   * decision-point vocabulary and the lint rules. Inferred from the idea / request when absent.
   */
  threatFamily: ThreatFamilyId.optional(),
})
export type ScenarioBrief = z.infer<typeof ScenarioBrief>

export const ScenarioOverview = z.object({
  theme: z.string(),
  threat: z.string(),
  operationalImpact: z.string(),
  coreSectionsTested: z.array(Citation).default([]),
  targetAudience: z.string().default(''),
  location: z.string().default(''),
})
export type ScenarioOverview = z.infer<typeof ScenarioOverview>

export const Objective = z.object({
  id: Id,
  /** Short label: "Communication", "Decision Making". */
  name: z.string().default(''),
  text: z.string(),
  metricRef: z.string().optional(),
})
export type Objective = z.infer<typeof Objective>

export const Phase = z.object({
  id: Id,
  index: z.number().int().nonnegative(),
  title: z.string(),
  goal: z.string(),
  /** Story beats the MSEL author must deliver in this phase (from phase_plan). */
  beats: z.array(z.string()).optional(),
  startTime: ExerciseTime,
  endTime: ExerciseTime,
})
export type Phase = z.infer<typeof Phase>

export const MselRow = z.object({
  /** "I-07", "I-07b", "START", "END" */
  id: z.string().min(1),
  phaseId: Id,
  time: ExerciseTime,
  wallClock: WallClock.optional(),
  from: z.string(),
  toRoleIds: z.array(z.string()).default([]),
  /** Free-text "To" as shown in the MSEL (e.g. "All", "Ops"); derived from roles if empty. */
  toLabel: z.string().optional(),
  event: z.string(),
  expectedAction: z.string(),
  purposeTag: PurposeTag,
  /** Suggested inject type for the deck page (taxonomy id). */
  format: z.string().optional(),
  injectId: Id.optional(),
  citations: z.array(Citation).default([]),
  locked: z.boolean().default(false),
})
export type MselRow = z.infer<typeof MselRow>

export const RubricMetric = z.object({
  id: Id,
  name: z.string(),
  points: z.number().int().nonnegative(),
  fail: z.string(),
  pass: z.string(),
  excellence: z.string(),
  linkedInjectIds: z.array(z.string()).default([]),
  objectiveRefs: z.array(z.string()).default([]),
})
export const Rubric = z.object({ metrics: z.array(RubricMetric).default([]) })
export type Rubric = z.infer<typeof Rubric>

export const HotWash = z.object({
  method: z.string().default('3up3down'),
  methodDescription: z.string().default(''),
  questions: z
    .array(
      z.object({
        topic: z.string().default(''),
        text: z.string(),
        objectiveRef: z.string().optional(),
      }),
    )
    .default([]),
})
export type HotWash = z.infer<typeof HotWash>

export const SimcellScript = z.object({
  rolePlayed: z.string(),
  trigger: z.string(),
  hardQuestions: z.array(z.string()).default([]),
  concessions: z.array(z.string()).default([]),
})
export type SimcellScript = z.infer<typeof SimcellScript>

export const STAGES = [
  'ideate',
  'scenario_overview',
  'objectives_roles',
  'phase_plan',
  'msel_phase',
  'inject_text',
  'inject_media_brief',
  'media_render',
  'controller_handbook',
  'rubric',
  'player_briefing',
  'hotwash',
  'critique',
] as const
export const Stage = z.enum(STAGES)
export type Stage = z.infer<typeof Stage>

export const StageRun = z.object({
  stage: Stage,
  /** For per-item stages (msel_phase, inject_text…): phase id or inject id. */
  itemId: z.string().optional(),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.optional(),
  providerRef: ProviderRef.optional(),
  model: z.string().optional(),
  promptRef: z.string().optional(),
  promptHash: z.string().optional(),
  inputTokens: z.number().int().optional(),
  outputTokens: z.number().int().optional(),
  costUsd: z.number().optional(),
  status: z.enum(['running', 'ok', 'error', 'stale', 'skipped']),
  error: z.string().optional(),
  repairAttempts: z.number().int().default(0),
})
export type StageRun = z.infer<typeof StageRun>

export const LintWarning = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  rowId: z.string().optional(),
  injectId: z.string().optional(),
  source: z.enum(['lint', 'critique']).default('lint'),
  suggestion: z.string().optional(),
  /**
   * Critique notes (#342): when the review wrote the note and a fingerprint of the cited row's
   * text then. Notes written before #342 have none; their time is the critique run's.
   */
  basis: z.object({ at: IsoDateTime, row: z.string().optional() }).optional(),
  /** Critique notes (#342): the cited row or its inject changed after the review ran. */
  stale: z.boolean().optional(),
})
export type LintWarning = z.infer<typeof LintWarning>

/** Markdown documents stored as files under scenarios/<id>/documents/. Paths in
 *  Scenario.documents are project-root-relative (scenarios/<id>/documents/handbook.md).
 *  `handouts` (player handouts: reference cards, evidence packets, clue cards) and
 *  `controller_handouts` (facilitator-only material such as a clue-card deck with controller
 *  notes) are optional and written by hand, never by a generation stage. */
export const SCENARIO_DOCS = [
  'overview',
  'handbook',
  'briefing',
  'hotwash',
  'handouts',
  'controller_handouts',
] as const
/** Document kinds no generation stage writes. */
export const HANDOUT_DOCS = [
  'handouts',
  'controller_handouts',
] as const satisfies readonly (typeof SCENARIO_DOCS)[number][]
export const ScenarioDocKind = z.enum(SCENARIO_DOCS)
export type ScenarioDocKind = z.infer<typeof ScenarioDocKind>

/** scenario.json format; missing means 1. A newer file is refused rather than rewritten. */
export const SCENARIO_FORMAT_VERSION = 1

/** Loose like Project (see PROJECT_FORMAT_VERSION): unknown keys survive a save (#208). */
export const Scenario = z.looseObject({
  formatVersion: z
    .number()
    .int()
    .default(SCENARIO_FORMAT_VERSION)
    .refine((v) => v <= SCENARIO_FORMAT_VERSION, {
      message: `This scenario was saved by a newer version of Action Stations (format newer than ${SCENARIO_FORMAT_VERSION}). Update the app to open it.`,
    }),
  id: Id,
  projectId: Id,
  title: z.string(),
  subtitle: z.string().optional(),
  version: z.number().int().positive().default(1),
  status: z.enum(['draft', 'ready', 'archived']).default('draft'),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  brief: ScenarioBrief,
  overview: ScenarioOverview.optional(),
  objectives: z.array(Objective).default([]),
  roles: z.array(Role).default([]),
  phases: z.array(Phase).default([]),
  msel: z.array(MselRow).default([]),
  documents: z
    .object({
      handbook: RelPath.optional(),
      briefing: RelPath.optional(),
      overview: RelPath.optional(),
      hotwash: RelPath.optional(),
      handouts: RelPath.optional(),
      controller_handouts: RelPath.optional(),
    })
    .default({}),
  rubric: Rubric.optional(),
  hotwash: HotWash.optional(),
  simcellScripts: z.array(SimcellScript).default([]),
  /** Resources for the ICS-201 critical resource status table. */
  criticalResources: z.array(z.string()).default([]),
  warnings: z.array(LintWarning).default([]),
  provenance: z.array(StageRun).default([]),
})
export type Scenario = z.infer<typeof Scenario>

export const ScenarioIdea = z.object({
  id: Id,
  title: z.string(),
  hook: z.string(),
  threat: z.string().default(''),
  systemsAffected: z.array(z.string()).default([]),
  sectionsExercised: z.array(Citation).default([]),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']).default('intermediate'),
  whyItTeaches: z.string().default(''),
  suggestedRoles: z.array(z.string()).default([]),
  /** Threat family the idea exercises (inferred from its text when the model did not say). */
  threatFamily: ThreatFamilyId.optional(),
})
export type ScenarioIdea = z.infer<typeof ScenarioIdea>
