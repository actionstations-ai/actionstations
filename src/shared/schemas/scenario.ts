import { z } from 'zod'
import { ThreatFamilyId } from '../domains/schema'
import { Citation, ExerciseTime, Id, IsoDateTime, RelPath, WallClock } from './common'
import { ComplianceId } from './compliance'
import { Evaluation } from './evaluation'
import { Role } from './project'
import { ProviderRef } from './provider'
import { PurposeTag } from '../taxonomy'
import { ScenarioGrounding } from './grounding'
import { PlanPassage } from './plan-conflicts'
import { ScenarioLanguages, ScenarioTranslations } from './translation'

/** At most this many plan seams per scenario (#427, open question 1). */
export const MAX_SEAMS = 3

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
  /** Plan seams to test (#427): ids of findings in plan-conflicts.json. */
  seamIds: z
    .array(z.string().regex(/^[0-9a-f]{16}$/))
    .max(MAX_SEAMS)
    .optional(),
  /** Narrative date of STARTEX ("2026-03-12"); regulatory clocks count business days from it (#426). */
  startDate: z.iso.date().optional(),
  /** Set when the scenario was started from the program's "propose next exercise" (#424). */
  programProposal: z
    .object({ at: z.string(), correctiveActionIds: z.array(z.string()).max(200).default([]) })
    .optional(),
  /** Set when the scenario is a regression drill built from another scenario (#431). */
  drillOf: z.object({ drillId: Id, sourceScenarioId: Id }).optional(),
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

/** How a branch decision turns a tally into an option (spec 0430 FR-4). Pure; never a model. */
export const BranchRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plurality') }),
  z.object({ kind: z.literal('majority') }),
  z.object({ kind: z.literal('threshold'), optionId: Id, minShare: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('controller') }),
  z.object({ kind: z.literal('unanimous') }),
])
export type BranchRule = z.infer<typeof BranchRule>

export const DecisionOption = z.object({
  id: Id,
  label: z.string().min(1).max(80),
  description: z.string().default(''),
  /** Branch that plays when chosen; absent = continue on the current path. */
  branchId: Id.optional(),
})
export type DecisionOption = z.infer<typeof DecisionOption>

const slugOption = (label: string, i: number): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `option-${i + 1}`

/** Reads the vote-only shape ({ question, options: string[] }) as a decision (spec 0430 FR-2). */
function fromVoteOnlyDecision(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.options) || !v.options.some((o) => typeof o === 'string')) return value
  const options = v.options.map((o, i) =>
    typeof o === 'string' ? { id: slugOption(o, i), label: o } : o,
  )
  const first = (options[0] as { id?: string } | undefined)?.id
  return {
    ...v,
    id: v.id ?? 'decision',
    options,
    defaultOptionId: v.defaultOptionId ?? first,
  }
}

/** A fork on a DECISION_POINT row: a question, 2-8 options, a rule and a default (spec 0430). */
export const Decision = z.preprocess(
  fromVoteOnlyDecision,
  z.object({
    id: Id,
    question: z.string().min(1),
    options: z.array(DecisionOption).min(2).max(8),
    mode: z.enum(['anonymous', 'by_role']).default('anonymous'),
    rule: BranchRule.default({ kind: 'plurality' }),
    defaultOptionId: Id,
    /** Minutes of exercise clock after the row is delivered; absent = no timeout. */
    timeoutMin: z.number().int().positive().optional(),
    /** Which roles' votes count; empty = everyone in the room. */
    votingRoleIds: z.array(Id).default([]),
  }),
)
export type Decision = z.infer<typeof Decision>

/** A labelled path that plays when its decision option is chosen. */
export const Branch = z.object({
  id: Id,
  label: z.string().min(1).max(80),
  decisionId: Id,
  optionId: Id,
  /** MselRow.id where play continues; absent = the branch ends the exercise (ENDEX row). */
  rejoinRowId: z.string().optional(),
  /** What this branch teaches. */
  rationale: z.string().default(''),
})
export type Branch = z.infer<typeof Branch>

/** A regulation trigger an MSEL row fires when it is delivered (#426). */
export const MselRowTrigger = z.object({ regulationId: ComplianceId, triggerId: ComplianceId })
export type MselRowTrigger = z.infer<typeof MselRowTrigger>

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
  /** The plan seam this row puts players in (#427): a ScenarioSeam id. */
  seamId: z.string().optional(),
  // The three #426 fields are optional (absent = none) rather than defaulted, so rows built in
  // code and rows written by older builds need no change.
  /** Regulatory triggers that delivering this row fires in Facilitate (#426). */
  triggers: z.array(MselRowTrigger).max(10).optional(),
  /** Accepted framework controls the row exercises: "<frameworkId>:<controlId>" (#426). */
  controls: z.array(z.string().max(120)).max(50).optional(),
  /** Suggested controls not yet accepted or removed (mapping rules or a model). */
  controlSuggestions: z
    .array(z.object({ ref: z.string().max(120), by: z.enum(['rule', 'model']) }))
    .max(100)
    .optional(),
  /** The branch this row belongs to (spec 0430); absent = trunk. */
  branchId: Id.optional(),
  /** The fork this row opens; meaningful on a DECISION_POINT row. */
  decision: Decision.optional(),
})
export type MselRow = z.infer<typeof MselRow>

/**
 * A plan seam the scenario tests (#427): a snapshot of the plan-conflicts.json finding, so the
 * scenario stays readable when the plan check runs again or the file goes away.
 */
export const ScenarioSeam = z.object({
  /** PlanFinding.id */
  id: z.string(),
  /** "release_approver", "notify_deadline", … (placement fallback, FR-5). */
  slot: z.string().default(''),
  slotLabel: z.string(),
  kind: z.enum(['contradiction', 'dangling_reference']),
  /** The finding's verdict when it was picked: `unconfirmed` is shown as such. */
  confirmed: z.boolean().default(false),
  a: PlanPassage,
  b: PlanPassage.optional(),
  values: z.tuple([z.string(), z.string()]).optional(),
  missingTarget: z.string().optional(),
  /** The phase the seam is tested in (FR-5). */
  phaseId: Id.optional(),
})
export type ScenarioSeam = z.infer<typeof ScenarioSeam>

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
        /** A plan seam question (#427): the seam and the rows that test it. */
        seamId: z.string().optional(),
        rowIds: z.array(z.string()).optional(),
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

/**
 * Exercise details (#420): what HSEEP documents print about the conduct of the exercise. Filled
 * in by the designer on the Scenario page; never generated and never sent to a provider. A
 * blank field prints a fill-in line in the documents, never an invented value.
 */
export const ConductDetails = z.object({
  /** As filed; exports use the scenario title when blank. */
  exerciseName: z.string().default(''),
  exerciseType: z.literal('tabletop').default('tabletop'),
  /** ISO dates (YYYY-MM-DD). */
  dates: z.array(z.string()).default([]),
  startTime: WallClock.optional(),
  endTime: WallClock.optional(),
  sponsor: z.string().default(''),
  participatingOrganizations: z.array(z.string()).default([]),
  director: z
    .object({ name: z.string(), organization: z.string(), phone: z.string(), email: z.string() })
    .partial()
    .default({}),
  site: z.string().default(''),
  room: z.string().default(''),
  observersAllowed: z.boolean().default(false),
  marking: z.string().default('EXERCISE — FOR TRAINING USE'),
  communications: z
    .array(z.object({ channel: z.string(), purpose: z.string(), detail: z.string().default('') }))
    .default([]),
  safetyNotes: z.string().default(''),
  securityNotes: z.string().default(''),
  acronyms: z.array(z.object({ term: z.string(), meaning: z.string() })).default([]),
})
export type ConductDetails = z.infer<typeof ConductDetails>

/** The scenario's exercise details with every default filled in (absent on older scenarios). */
export const conductOf = (s: { conduct?: unknown }): ConductDetails =>
  ConductDetails.parse(s.conduct ?? {})

/** One Situation Manual module (one per phase): what players know at its start (#420). */
export const SitManModule = z.object({
  phaseId: Id,
  narrativeMd: z.string(),
  keyIssues: z.array(z.string()).default([]),
  discussionQuestions: z
    .array(
      z.object({
        text: z.string(),
        roleIds: z.array(Id).default([]),
        objectiveRef: z.string().optional(),
        citations: z.array(Citation).default([]),
      }),
    )
    .default([]),
})
export type SitManModule = z.infer<typeof SitManModule>

export const SitMan = z.object({
  assumptions: z.array(z.string()).default([]),
  artificialities: z.array(z.string()).default([]),
  modules: z.array(SitManModule).default([]),
})
export type SitMan = z.infer<typeof SitMan>

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
  'eeg',
  'player_briefing',
  'hotwash',
  'sitman',
  'critique',
  /** Model verification of grounding labels (#423); not part of the pipeline. */
  'grounding_verify',
  /** Model confirmation of a plan conflict (#423); not part of the pipeline. */
  'plan_conflict',
  /** On demand after the exercise (#419); not part of the scenario pipeline. */
  'aar',
  /** Revised wording for a plan section from an AAR finding (#431); on demand. */
  'plan_redline',
  /** The STARTEX situation summary of a regression drill (#431); on demand. */
  'drill_startex',
  /** A micro-drill built from one plan annex (#437); on demand. */
  'micro_drill_build',
  /** One answer of a micro-drill checked against the step's expected points (#437). */
  'micro_drill_assess',
  /** Player-language translation (spec 0435); on demand from the Languages panel. */
  'translate',
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
 *  notes) are optional and written by hand, never by a generation stage. `aar` is the
 *  After-Action Report / Improvement Plan drafted after the exercise (#419). */
export const SCENARIO_DOCS = [
  'overview',
  'handbook',
  'briefing',
  'hotwash',
  'handouts',
  'controller_handouts',
  'aar',
] as const
/** Document kinds no generation stage writes. */
export const HANDOUT_DOCS = [
  'handouts',
  'controller_handouts',
] as const satisfies readonly (typeof SCENARIO_DOCS)[number][]
export const ScenarioDocKind = z.enum(SCENARIO_DOCS)
export type ScenarioDocKind = z.infer<typeof ScenarioDocKind>

/** scenario.json format; missing means 1, branched scenarios write 2. A newer file is refused. */
export const SCENARIO_FORMAT_VERSION = 2

/**
 * The version a scenario is written with: 2 only when it has branches (so a build that does
 * not know branches refuses the file instead of showing every branch as trunk rows), else 1.
 */
export const formatVersionFor = (s: { branches?: unknown[] | undefined }): 1 | 2 =>
  s.branches?.length ? 2 : 1

/** Loose like Project (see PROJECT_FORMAT_VERSION): unknown keys survive a save (#208). */
export const Scenario = z.looseObject({
  formatVersion: z
    .number()
    .int()
    .default(1)
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
      /** The After-Action Report / Improvement Plan draft (#419), rendered from aar.json. */
      aar: RelPath.optional(),
    })
    .default({}),
  rubric: Rubric.optional(),
  /**
   * Objectives → Core Capabilities and the Exercise Evaluation Guides (#421). Empty for
   * scenarios written before the eeg stage existed; "Generate evaluation guides" fills it.
   */
  evaluation: Evaluation.default({ objectiveCapabilities: [], eegs: [] }),
  hotwash: HotWash.optional(),
  simcellScripts: z.array(SimcellScript).default([]),
  /** Exercise details for the HSEEP documents (#420); read through conductOf(). */
  conduct: ConductDetails.optional(),
  /** Situation Manual modules, assumptions and artificialities (stage `sitman`, #420). */
  sitman: SitMan.optional(),
  /** Resources for the ICS-201 critical resource status table. */
  criticalResources: z.array(z.string()).default([]),
  warnings: z.array(LintWarning).default([]),
  provenance: z.array(StageRun).default([]),
  /** Grounding labels per item (#423); computed on demand when absent. */
  grounding: ScenarioGrounding.optional(),
  /** Plan seams the scenario tests (#427), snapshotted from plan-conflicts.json. */
  seams: z.array(ScenarioSeam).default([]),
  /** Branches of the MSEL (spec 0430); absent when there are none, so unbranched files are unchanged. */
  branches: z.array(Branch).optional(),
  /** Extra player languages and whether controller material is translated too (spec 0435). */
  languages: ScenarioLanguages.optional(),
  /** Translated documents per language; injects carry their own translations. */
  translations: ScenarioTranslations.optional(),
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
  /** Plan seams the idea puts under pressure (#427): PlanFinding ids. */
  seamIds: z.array(z.string()).optional(),
})
export type ScenarioIdea = z.infer<typeof ScenarioIdea>
