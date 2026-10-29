// After-Action Report / Improvement Plan (#419): the HSEEP 2020 AAR/IP drafted from the
// exercise record and confirmed by a person. The model proposes ratings, strengths, areas for
// improvement and corrective actions; the schema keeps the person's decisions apart from the
// proposals (`rating` vs `proposedRating`, `ownerOrganization` and dates typed by a person) so a
// draft is never mistaken for a decision. Non-attribution: no field holds a participant's name;
// the only people named are the owner and point of contact a planner types into the plan.
//
// Every free-text field has a cap: the fields come from a model and from a live-play log, so
// the schema is the boundary, not the UI.
import { z } from 'zod'
import { CoreCapabilityId } from '../core-capabilities'
import { Citation, Id, IsoDateTime } from './common'
import { Observation } from './evaluation'
import { StageRun } from './scenario'
import { SurveySummary } from './survey'

/** HSEEP 2020 capability ratings, in the order the AAR/IP legend lists them. */
export const CAPABILITY_RATINGS = ['P', 'S', 'M', 'U'] as const
export const CapabilityRating = z.enum(CAPABILITY_RATINGS)
export type CapabilityRating = z.infer<typeof CapabilityRating>

export const CAPABILITY_RATING_LABELS: Record<CapabilityRating, string> = {
  P: 'Performed without Challenges',
  S: 'Performed with Some Challenges',
  M: 'Performed with Major Challenges',
  U: 'Unable to be Performed',
}

/** The HSEEP definitions printed in the document (public domain, FEMA HSEEP 2020). */
export const CAPABILITY_RATING_DEFINITIONS: Record<CapabilityRating, string> = {
  P: 'The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s) and did not negatively impact the performance of other activities. Performance of this activity did not contribute to additional health and/or safety risks for the public or for emergency workers, and it was conducted in accordance with applicable plans, policies, procedures, regulations, and laws.',
  S: 'The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s) and did not negatively impact the performance of other activities. Performance of this activity did not contribute to additional health and/or safety risks for the public or for emergency workers, and it was conducted in accordance with applicable plans, policies, procedures, regulations, and laws. However, opportunities to enhance effectiveness and/or efficiency were identified.',
  M: 'The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s), but some or all of the following were observed: demonstrated performance had a negative impact on the performance of other activities; contributed to additional health and/or safety risks for the public or for emergency workers; and/or was not conducted in accordance with applicable plans, policies, procedures, regulations, and laws.',
  U: 'The targets and critical tasks associated with the core capability were not performed in a manner that achieved the objective(s).',
}

/** The POETE capability elements a corrective action improves. */
export const CAPABILITY_ELEMENTS = [
  'planning',
  'organization',
  'equipment',
  'training',
  'exercises',
] as const
export const CapabilityElement = z.enum(CAPABILITY_ELEMENTS)
export type CapabilityElement = z.infer<typeof CapabilityElement>

export const CAPABILITY_ELEMENT_LABELS: Record<CapabilityElement, string> = {
  planning: 'Planning',
  organization: 'Organization',
  equipment: 'Equipment',
  training: 'Training',
  exercises: 'Exercises',
}

/** The vocabulary shared by the Facilitate hot wash list and the live `hotwash.item` message. */
export const HOTWASH_ITEM_KINDS = ['strength', 'improvement', 'other'] as const
export const HotwashItemKind = z.enum(HOTWASH_ITEM_KINDS)
export type HotwashItemKind = z.infer<typeof HotwashItemKind>

export const HOTWASH_ITEM_KIND_LABELS: Record<HotwashItemKind, string> = {
  strength: 'Went well',
  improvement: 'To improve',
  other: 'Other',
}

/** Caps on free text (characters) and list sizes. */
export const AAR_LIMITS = {
  title: 200,
  analysis: 6000,
  recommendation: 2000,
  rationale: 2000,
  action: 1000,
  owner: 200,
  poc: 200,
  summary: 20_000,
  feedback: 20_000,
  organization: 200,
  acronym: 40,
  meaning: 200,
  instructions: 4000,
  evidencePerFinding: 50,
  citationsPerFinding: 20,
  actionsPerFinding: 10,
  findingsPerCapability: 20,
  capabilities: 32,
  organizations: 100,
  acronyms: 100,
  /** Record items (notes, hot wash items, decisions, votes, messages) kept per list. */
  recordItems: 5000,
  recordText: 4000,
} as const

/**
 * Where a finding's evidence comes from: `note:I-09` (facilitator note on a row, `note:general`
 * for the general notes), `obs:<observationId>`, `hw:<itemId>` (hot wash item), `dec:<id>`
 * (decision log), `vote:<voteId>`, `msg:<messageId>`, `survey:<surveyId>[:<questionId>]`,
 * `log:<index>` (a raw session log entry). Refs are copied from the record; an unknown one is
 * dropped by the mapper.
 */
export const EvidenceRef = z
  .string()
  .regex(/^(note|obs|hw|dec|vote|msg|survey|log):[A-Za-z0-9:_.-]+$/)
  .max(200)
export type EvidenceRef = z.infer<typeof EvidenceRef>

export const CorrectiveAction = z.object({
  id: Id,
  action: z.string().max(AAR_LIMITS.action),
  element: CapabilityElement,
  /** Role id the model proposes as owner; a person sets the organization and contact. */
  ownerRole: Id.optional(),
  ownerOrganization: z.string().max(AAR_LIMITS.owner).default(''),
  poc: z.string().max(AAR_LIMITS.poc).default(''),
  /** ISO date (YYYY-MM-DD), typed by a person. */
  startDate: z.string().max(10).optional(),
  dueDate: z.string().max(10).optional(),
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
  /** A locked action survives a re-draft. */
  locked: z.boolean().default(false),
  /** The exercise program's corrective action this was imported as (#424). */
  programActionId: Id.optional(),
})
export type CorrectiveAction = z.infer<typeof CorrectiveAction>

export const Finding = z.object({
  id: Id,
  title: z.string().max(AAR_LIMITS.title),
  analysisMd: z.string().max(AAR_LIMITS.analysis),
  citations: z.array(Citation).max(AAR_LIMITS.citationsPerFinding).default([]),
  evidence: z.array(EvidenceRef).min(1).max(AAR_LIMITS.evidencePerFinding),
  objectiveRefs: z.array(Id).max(50).default([]),
  /** Areas for improvement only. */
  recommendation: z.string().max(AAR_LIMITS.recommendation).default(''),
  correctiveActions: z.array(CorrectiveAction).max(AAR_LIMITS.actionsPerFinding).default([]),
  /** A locked finding survives a re-draft with its text and actions. */
  locked: z.boolean().default(false),
})
export type Finding = z.infer<typeof Finding>

export const ObservationCounts = z.object({
  met: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  not_met: z.number().int().nonnegative(),
  not_observed: z.number().int().nonnegative(),
})
export type ObservationCounts = z.infer<typeof ObservationCounts>

export const CapabilityAnalysis = z.object({
  capability: CoreCapabilityId,
  /** Confirmed by a person; the document prints only this one. */
  rating: CapabilityRating.optional(),
  /** Proposed by the model; absent when the record holds too little evidence. */
  proposedRating: CapabilityRating.optional(),
  ratingRationale: z.string().max(AAR_LIMITS.rationale).default(''),
  observationCounts: ObservationCounts.default({ met: 0, partial: 0, not_met: 0, not_observed: 0 }),
  objectiveRefs: z.array(Id).max(50).default([]),
  strengths: z.array(Finding).max(AAR_LIMITS.findingsPerCapability).default([]),
  areasForImprovement: z.array(Finding).max(AAR_LIMITS.findingsPerCapability).default([]),
})
export type CapabilityAnalysis = z.infer<typeof CapabilityAnalysis>

export const RECORD_SOURCES = ['facilitator', 'evaluation', 'live', 'surveys'] as const
export const RecordSource = z.enum(RECORD_SOURCES)
export type RecordSource = z.infer<typeof RecordSource>

export const Acronym = z.object({
  term: z.string().min(1).max(AAR_LIMITS.acronym),
  meaning: z.string().max(AAR_LIMITS.meaning),
})
export type Acronym = z.infer<typeof Acronym>

/** scenarios/<id>/aar.json. Loose so a newer build's fields survive a save (ADR-0016). */
export const Aar = z.looseObject({
  formatVersion: z.number().int().default(1),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** ISO date (YYYY-MM-DD) of the exercise, typed by a person. */
  exerciseDate: z.string().max(10).optional(),
  executiveSummaryMd: z.string().max(AAR_LIMITS.summary).default(''),
  sourcesUsed: z.array(RecordSource).default([]),
  /** The live session the record was read from, when live play ran. */
  liveSessionId: z.string().max(64).optional(),
  capabilities: z.array(CapabilityAnalysis).max(AAR_LIMITS.capabilities).default([]),
  participantFeedbackMd: z.string().max(AAR_LIMITS.feedback).default(''),
  /** Appendix B: organizations that took part, typed by a person (never people). */
  participatingOrganizations: z
    .array(z.string().max(AAR_LIMITS.organization))
    .max(AAR_LIMITS.organizations)
    .default([]),
  /** Appendix D, on top of the built-in HSEEP terms. */
  acronyms: z.array(Acronym).max(AAR_LIMITS.acronyms).default([]),
  provenance: z.array(StageRun).default([]),
})
export type Aar = z.infer<typeof Aar>

// ---------------------------------------------------------------------------------------------
// The exercise record the draft is built from (spec 0419 FR-1). Built in main from the scenario
// folder; the renderer reads it through aar:record for the evidence drawer. Live-play identities
// are removed before it exists (FR-10): `fromRole` and `byRole` are role labels, never names.

const recordText = z.string().max(AAR_LIMITS.recordText)
const recordList = <T extends z.ZodType>(item: T) => z.array(item).max(AAR_LIMITS.recordItems)

export const RecordNote = z.object({
  ref: EvidenceRef,
  rowId: z.string().max(64).optional(),
  text: recordText,
})
export type RecordNote = z.infer<typeof RecordNote>

export const RecordHotwashItem = z.object({
  ref: EvidenceRef,
  kind: HotwashItemKind,
  text: recordText,
  objectiveRef: z.string().max(128).optional(),
  rowId: z.string().max(64).optional(),
  /** Live play: how many devices seconded the item. */
  plusOnes: z.number().int().nonnegative().default(0),
  /** Live play: the controller promoted it to the board. */
  promoted: z.boolean().default(false),
})
export type RecordHotwashItem = z.infer<typeof RecordHotwashItem>

export const RecordDecision = z.object({
  ref: EvidenceRef,
  exerciseTime: z.string().max(8).optional(),
  rowId: z.string().max(64).optional(),
  text: recordText,
  /** Role label (abbreviation or name), never a person. */
  byRole: z.string().max(120).optional(),
})
export type RecordDecision = z.infer<typeof RecordDecision>

export const RecordVote = z.object({
  ref: EvidenceRef,
  rowId: z.string().max(64).optional(),
  exerciseTime: z.string().max(8).optional(),
  question: recordText,
  options: z.array(z.object({ label: z.string().max(200), count: z.number().int() })).max(10),
  voted: z.number().int().nonnegative().optional(),
  eligible: z.number().int().nonnegative().optional(),
})
export type RecordVote = z.infer<typeof RecordVote>

export const RecordMessage = z.object({
  ref: EvidenceRef,
  exerciseTime: z.string().max(8).optional(),
  fromRole: z.string().max(160),
  toRole: z.string().max(160).optional(),
  text: recordText,
  /** Replies to this inject. */
  rowId: z.string().max(64).optional(),
  pinned: z.boolean().default(false),
})
export type RecordMessage = z.infer<typeof RecordMessage>

export const RecordObservation = Observation.extend({ ref: EvidenceRef })
export type RecordObservation = z.infer<typeof RecordObservation>

export const ExerciseRecord = z.object({
  sources: z.object({
    facilitator: z.boolean(),
    evaluation: z.boolean(),
    live: z.boolean(),
    surveys: z.boolean(),
  }),
  liveSessionId: z.string().max(64).optional(),
  delivered: recordList(
    z.object({
      rowId: z.string().max(64),
      exerciseTime: z.string().max(8),
      at: z.string().max(40),
    }),
  ),
  notes: recordList(RecordNote),
  hotwash: recordList(RecordHotwashItem),
  decisions: recordList(RecordDecision),
  observations: z.array(RecordObservation).max(10_000),
  votes: recordList(RecordVote),
  messages: recordList(RecordMessage),
  /** Messages per role label, for the prompt's summary line. */
  messageCounts: z.array(z.object({ role: z.string().max(160), count: z.number().int() })),
  surveys: z.array(SurveySummary).max(100),
  /** Sources that were present but could not be read in full. */
  warnings: z.array(z.string().max(500)).default([]),
})
export type ExerciseRecord = z.infer<typeof ExerciseRecord>

/** Every evidence ref the record can be cited with. */
export function recordRefs(record: ExerciseRecord): Set<string> {
  const refs = new Set<string>()
  for (const list of [
    record.notes,
    record.hotwash,
    record.decisions,
    record.votes,
    record.messages,
  ])
    for (const item of list) refs.add(item.ref)
  for (const o of record.observations) refs.add(o.ref)
  for (const s of record.surveys) {
    refs.add(`survey:${s.surveyId}`)
    for (const q of s.questions) refs.add(`survey:${s.surveyId}:${q.questionId}`)
  }
  return refs
}

/** True when nothing a draft could rest on was recorded. */
export function recordIsEmpty(record: ExerciseRecord): boolean {
  return (
    !record.notes.length &&
    !record.hotwash.length &&
    !record.decisions.length &&
    !record.observations.length &&
    !record.votes.length &&
    !record.messages.length &&
    !record.surveys.length
  )
}

/** 'draft' while any exercised capability has no confirmed rating; nothing unconfirmed prints as final. */
export function aarStatus(aar: Pick<Aar, 'capabilities'>): 'draft' | 'reviewed' {
  return aar.capabilities.every((c) => c.rating) ? 'reviewed' : 'draft'
}

/** Every corrective action of the plan, with its capability and finding, in document order. */
export function improvementPlanRows(aar: Pick<Aar, 'capabilities'>) {
  return aar.capabilities.flatMap((c) =>
    c.areasForImprovement.flatMap((f) =>
      f.correctiveActions.map((action) => ({ capability: c.capability, finding: f, action })),
    ),
  )
}
