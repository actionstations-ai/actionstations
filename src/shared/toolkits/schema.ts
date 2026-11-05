// Toolkits (ADR-0074, spec 0448): shared field expertise any scenario can use. A domain
// profile describes the organization being exercised; a toolkit bundles what a field knows
// (weather, flooding, wildfire…): the inject types and outside parties it adds, the knowledge
// the generator needs to write that field correctly, the structured decisions players make,
// and the code-backed parts it names by id (figure kinds, data connectors, metrics, lint
// rules). Packs stay data only (ADR-0018): anything that needs code is a built-in capability
// the toolkit names. Pure data + zod: no Node imports, so the renderer can use it.
import { z } from 'zod'

/** Toolkit id: also the file name `toolkits/<id>.json` in a pack. */
export const ToolkitId = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)

/** An id of a built-in capability (figure kind, connector, metric, lint rule). */
const CapabilityId = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/)

const Short = z.string().min(1).max(200)
const Prose = z.string().max(2000)
const Key = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)

/** When a toolkit is proposed: hazard and threat words in the brief, and the domains it suits. */
export const ToolkitApplies = z.object({
  /** Lower-case hazard and threat words or phrases ("tornado", "flash flood"). */
  keywords: z.array(Short).max(100).default([]),
  /** Domain profile ids the toolkit is a natural fit for. */
  domains: z.array(z.string().max(64)).max(50).default([]),
})
export type ToolkitApplies = z.infer<typeof ToolkitApplies>

/** An advisor role a domain can add when the toolkit is on ("Meteorologist liaison"). */
export const ToolkitAdvisorRole = z.object({
  key: Key,
  name: Short,
  abbreviation: z.string().max(20).default(''),
  team: z.string().max(100).default('Advisors'),
  description: Prose.default(''),
})
export type ToolkitAdvisorRole = z.infer<typeof ToolkitAdvisorRole>

/** A reference document in a library pack the toolkit points users to. */
export const ToolkitDocumentRef = z.object({
  packId: z.string().max(128),
  /** The document group id in that pack (documents/<id>/…). */
  documentId: z.string().max(64),
  title: Short,
})
export type ToolkitDocumentRef = z.infer<typeof ToolkitDocumentRef>

/** An evaluation metric from the app's built-in set, with the toolkit's configuration. */
export const ToolkitMetric = z.object({
  id: CapabilityId,
  label: Short.optional(),
  config: z
    .record(
      z.string().max(64),
      z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(200)).max(50)]),
    )
    .default({}),
  /** Case dataset id (events) the metric compares decisions against; ground truth. */
  groundTruth: z.string().max(64).optional(),
  /** Case dataset id (modeled series) a threshold metric reads. */
  series: z.string().max(64).optional(),
})
export type ToolkitMetric = z.infer<typeof ToolkitMetric>

export const DECISION_FIELD_KINDS = ['text', 'number', 'choice', 'time', 'area'] as const

/** One field of a decision form. */
export const DecisionField = z
  .object({
    id: Key,
    label: Short,
    kind: z.enum(DECISION_FIELD_KINDS),
    required: z.boolean().default(false),
    /** The options of a `choice` field. */
    choices: z.array(Short).max(50).default([]),
    /** The named places of an `area` field; the scenario's case area is offered when empty. */
    areas: z.array(Short).max(40).default([]),
    /** An `area` field may also be drawn on a map where the screen has one. */
    draw: z.boolean().default(false),
  })
  .refine((f) => f.kind !== 'choice' || f.choices.length >= 2, {
    message: 'a choice field needs at least two choices',
    path: ['choices'],
  })
export type DecisionField = z.infer<typeof DecisionField>

/**
 * A regulatory clock trigger a recorded decision fires (spec 0426, spec 0459 FR-8): the trigger
 * of a regulation, optionally only when a choice field holds one of its labels. Firing is
 * recorded once per decision and only for a regulation the project has switched on.
 */
export const DecisionTrigger = z
  .object({
    regulation: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    trigger: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    /** A choice field of this form; with `equals`, the trigger fires only for that choice. */
    field: Key.optional(),
    /** The label of the choice that fires it. */
    equals: Short.optional(),
  })
  .refine((t) => (t.field === undefined) === (t.equals === undefined), {
    message: 'field and equals go together',
    path: ['equals'],
  })
export type DecisionTrigger = z.infer<typeof DecisionTrigger>

/** A structured decision players make or the facilitator records ("Order an evacuation"). */
export const DecisionForm = z
  .object({
    id: Key,
    label: Short,
    description: Prose.default(''),
    fields: z.array(DecisionField).max(30).default([]),
    /** Regulatory clock triggers a recorded decision of this form fires. */
    firesTriggers: z.array(DecisionTrigger).max(10).optional(),
  })
  .refine((f) => new Set(f.fields.map((x) => x.id)).size === f.fields.length, {
    message: 'field ids must be unique within a form',
    path: ['fields'],
  })
  .refine(
    (f) =>
      (f.firesTriggers ?? []).every(
        (t) =>
          t.field === undefined ||
          f.fields.some(
            (x) => x.id === t.field && x.kind === 'choice' && x.choices.includes(t.equals ?? ''),
          ),
      ),
    {
      message: 'a trigger names a choice field of the form and one of its choices',
      path: ['firesTriggers'],
    },
  )
export type DecisionForm = z.infer<typeof DecisionForm>

/** What the generator needs to write the field correctly, as prompt fragments. */
export const ToolkitKnowledge = z.object({
  glossary: z
    .array(z.object({ term: Short, definition: z.string().max(600) }))
    .max(200)
    .default([]),
  /** How the field's products look and read (formats, units, issuance conventions). */
  productConventions: z.array(z.string().max(600)).max(100).default([]),
  /** What a knowledgeable reader would catch if it were wrong. */
  realismRules: z.array(z.string().max(600)).max(100).default([]),
})
export type ToolkitKnowledge = z.infer<typeof ToolkitKnowledge>

/** Identifiers and tasks a toolkit ties to one Core Capability (spec 0457 FR-13). */
export const ToolkitCapabilityNote = z.object({
  /** A FEMA Core Capability id (src/shared/core-capabilities.ts). */
  coreCapability: z.string().regex(/^[a-z][a-z0-9_]{0,80}$/),
  /** Critical tasks an evaluator looks for, phrased for this field. */
  criticalTasks: z.array(z.string().max(400)).max(20).default([]),
  /** The same capability in another framework (PHEP capability numbers, for example). */
  mappings: z
    .array(
      z.object({
        framework: Short,
        ids: z.array(Short).max(20),
      }),
    )
    .max(5)
    .default([]),
})
export type ToolkitCapabilityNote = z.infer<typeof ToolkitCapabilityNote>

export const EXERCISE_TAG_TYPES = ['discussion', 'functional', 'drill', 'full_scale'] as const

/**
 * An exercise a funding or accreditation program defines (the PHEP Biological Incident 100, for
 * example). Tagging a scenario with it sets suggested objectives and participants and adds the
 * program's improvement plan fields to the AAR. The text is versioned with `version`, the date
 * of the program document it was read from; the app submits nothing to the program.
 */
export const ToolkitExerciseTag = z.object({
  id: Key,
  label: Short,
  program: Short,
  /** Date or edition of the program text ("April 2024"). */
  version: Short,
  /** Where the text was read; http or https. */
  source: z
    .string()
    .regex(/^https?:\/\/\S+$/)
    .max(300),
  type: z.enum(EXERCISE_TAG_TYPES),
  description: Prose.default(''),
  objectives: z.array(z.string().max(600)).max(12).default([]),
  participants: Prose.default(''),
  frequency: Short.optional(),
  /** Program capabilities the exercise touches, as labels ("Capability 8: ..."). */
  capabilities: z.array(Short).max(15).default([]),
  /**
   * The framework name the toolkits' capability `mappings` use for these capabilities ("CDC PHEP
   * capabilities (2018)"). With it, the AAR maps each program capability to the Core Capabilities
   * the exercise evaluated.
   */
  capabilityFramework: Short.optional(),
  /** Cross-cutting program priorities the exercise must include. */
  priorities: z.array(Short).max(10).default([]),
  /** Days after the exercise by which the program asks for improvement plan data. */
  improvementPlanDueDays: z.number().int().min(1).max(365).optional(),
  notes: z.array(z.string().max(600)).max(10).default([]),
  /**
   * A drill record the program asks for (42 CFR 73.14 for a registered entity's incident response
   * plan): the AAR adds a table of these elements, filled from the improvement plan and the
   * participants, says which are missing, and prompts a review of the plan afterward.
   */
  drillRecord: z
    .object({
      elements: z.array(Short).min(1).max(8),
      reviewPrompt: z.string().max(600),
    })
    .optional(),
})
export type ToolkitExerciseTag = z.infer<typeof ToolkitExerciseTag>

/**
 * Safeguards for sensitive content (spec 0464 FR-13). When the scenario's text contains one of
 * the `triggers`, the briefing opens with `contentNotice`, the Exercise Plan and the handbook
 * carry the notice, and facilitators get the `wellbeingCheck` lines and the `stopAndStepOut`
 * rule. The text is data so a pack can improve it without a release.
 */
export const ToolkitSafeguards = z.object({
  /** Lower-case words or phrases in a scenario that switch the safeguards on. */
  triggers: z.array(Short).min(1).max(60),
  contentNotice: z.string().min(1).max(1200),
  /** What the facilitator says or asks, one line each. */
  wellbeingCheck: z.array(z.string().min(1).max(400)).min(1).max(10),
  stopAndStepOut: z.string().min(1).max(600),
})
export type ToolkitSafeguards = z.infer<typeof ToolkitSafeguards>

export const ToolkitSchema = z.object({
  id: ToolkitId,
  name: Short,
  description: Prose,
  appliesTo: ToolkitApplies.default({ keywords: [], domains: [] }),
  /** Inject type ids it adds; their templates ship in the same pack (`templates/<id>/`). */
  injectTypes: z
    .array(z.string().regex(/^[a-z0-9_]+$/))
    .max(100)
    .default([]),
  /** Built-in figure kind ids it uses. */
  figureKinds: z.array(CapabilityId).max(50).default([]),
  /** Built-in data connector ids it uses. */
  connectors: z.array(CapabilityId).max(20).default([]),
  outsideParties: z.array(Short).max(50).default([]),
  advisorRoles: z.array(ToolkitAdvisorRole).max(20).default([]),
  documents: z.array(ToolkitDocumentRef).max(50).default([]),
  /** Built-in evaluation metrics, configured. */
  metrics: z.array(ToolkitMetric).max(30).default([]),
  decisionForms: z.array(DecisionForm).max(30).default([]),
  knowledge: ToolkitKnowledge.default({ glossary: [], productConventions: [], realismRules: [] }),
  /** Built-in lint rule ids (format checks such as VTEC or METAR syntax). */
  lintRules: z.array(CapabilityId).max(50).default([]),
  /** Critical tasks and framework mappings per Core Capability (spec 0457 FR-13). */
  capabilities: z.array(ToolkitCapabilityNote).max(40).default([]),
  /** Program exercises a scenario can be tagged with (spec 0457 FR-14). */
  exerciseTags: z.array(ToolkitExerciseTag).max(40).default([]),
  /** Content notice, wellbeing check and step-out rule for sensitive scenarios (spec 0464 FR-13). */
  safeguards: ToolkitSafeguards.optional(),
})
export type Toolkit = z.infer<typeof ToolkitSchema>

/** Where a toolkit comes from, as the registry lists it. */
export const ToolkitSource = z.object({
  layer: z.enum(['bundled', 'pack']),
  packId: z.string(),
  packName: z.string(),
  packVersion: z.string(),
})
export type ToolkitSource = z.infer<typeof ToolkitSource>
