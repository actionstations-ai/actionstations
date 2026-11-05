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

/** A structured decision players make or the facilitator records ("Order an evacuation"). */
export const DecisionForm = z
  .object({
    id: Key,
    label: Short,
    description: Prose.default(''),
    fields: z.array(DecisionField).max(30).default([]),
  })
  .refine((f) => new Set(f.fields.map((x) => x.id)).size === f.fields.length, {
    message: 'field ids must be unique within a form',
    path: ['fields'],
  })
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
  /** Cross-cutting program priorities the exercise must include. */
  priorities: z.array(Short).max(10).default([]),
  /** Days after the exercise by which the program asks for improvement plan data. */
  improvementPlanDueDays: z.number().int().min(1).max(365).optional(),
  notes: z.array(z.string().max(600)).max(10).default([]),
})
export type ToolkitExerciseTag = z.infer<typeof ToolkitExerciseTag>

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
