// Classroom and course use (#686, spec 0453, ADR-0090): courses, sections, rosters, learning
// outcomes, rubrics, evidence, scores, accommodations and rotation plans. Everything here is
// stored under `classroom/` in the project folder, never in scenario files, so exercise bundles,
// pack exports and shared copies leave it behind. Persisted roots are loose (ADR-0016).
import { z } from 'zod'
import { Id, IsoDateTime } from './common'

export const CLASSROOM_DIR = 'classroom'
export const CLASSROOM_FORMAT_VERSION = 1

/** Caps from NFR-5; free text uses the same limits as the evaluation schema. */
export const CLASSROOM_LIMITS = {
  students: 500,
  sections: 20,
  outcomes: 100,
  mappings: 2000,
  rubrics: 100,
  criteria: 30,
  minLevels: 3,
  maxLevels: 6,
  name: 120,
  identifier: 64,
  email: 200,
  text: 1000,
  note: 4000,
  evidence: 100_000,
  scores: 100_000,
  sessions: 200,
  rotationSessions: 40,
} as const

const Name = z.string().trim().min(1).max(CLASSROOM_LIMITS.name)
const Note = z.string().max(CLASSROOM_LIMITS.note)

/** Project setting (project.json). Off unless the instructor turns it on. */
export const ClassroomSettings = z.object({
  enabled: z.boolean().default(false),
  /** When the instructor accepted the notice that scores name students. */
  noticeAcceptedAt: IsoDateTime.optional(),
})
export type ClassroomSettings = z.infer<typeof ClassroomSettings>

export const CLASSROOM_NOTICE =
  'Scores name students. Ratings become grades only when the instructor confirms them. ' +
  'Student records stay in this project folder and are left out of shared exports.'

export const Course = z.object({
  id: Id,
  name: Name,
  term: z.string().trim().max(60).default(''),
})
export type Course = z.infer<typeof Course>

export const Section = z.object({ id: Id, name: Name })
export type Section = z.infer<typeof Section>

/** A roster entry: a display name, an optional institution id and an optional email; nothing else. */
export const Student = z.object({
  id: Id,
  sectionId: Id,
  name: Name,
  institutionId: z.string().trim().max(CLASSROOM_LIMITS.identifier).optional(),
  email: z.string().trim().max(CLASSROOM_LIMITS.email).optional(),
})
export type Student = z.infer<typeof Student>

export const BLOOM_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const
export const Outcome = z.object({
  id: Id,
  code: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1).max(CLASSROOM_LIMITS.text),
  bloom: z.enum(BLOOM_LEVELS).optional(),
  programOutcome: z.string().trim().max(40).optional(),
})
export type Outcome = z.infer<typeof Outcome>

/** What an outcome can be mapped from: an exercise objective, a Core Capability or a critical task. */
export const MAPPING_KINDS = ['objective', 'capability', 'task'] as const
export const OutcomeMapping = z.object({
  outcomeId: Id,
  kind: z.enum(MAPPING_KINDS),
  /** Objective id, capability id or critical task id. */
  ref: z.string().min(1).max(200),
  /** A generator proposal stays a suggestion until the instructor confirms it. */
  confirmed: z.boolean().default(true),
})
export type OutcomeMapping = z.infer<typeof OutcomeMapping>

export const OutcomeSet = z.object({
  formatVersion: z.literal(1).default(1),
  name: Name,
  outcomes: z.array(Outcome).max(CLASSROOM_LIMITS.outcomes),
})
export type OutcomeSet = z.infer<typeof OutcomeSet>

export const ClassroomRubricLevel = z.object({
  label: z.string().trim().min(1).max(60),
  descriptor: z.string().max(CLASSROOM_LIMITS.text).default(''),
  points: z.number().min(0).max(1000),
})
export type ClassroomRubricLevel = z.infer<typeof ClassroomRubricLevel>

export const ClassroomRubricCriterion = z.object({
  id: Id,
  name: Name,
  description: z.string().max(CLASSROOM_LIMITS.text).default(''),
  weight: z.number().positive().max(1000).default(1),
  /** 3 to 6 levels, ordered lowest to highest. */
  levels: z
    .array(ClassroomRubricLevel)
    .min(CLASSROOM_LIMITS.minLevels)
    .max(CLASSROOM_LIMITS.maxLevels),
  outcomeIds: z.array(Id).max(20).default([]),
  taskIds: z.array(z.string().max(200)).max(50).default([]),
})
export type ClassroomRubricCriterion = z.infer<typeof ClassroomRubricCriterion>

/** `team` rubrics score the whole team; any other role is a role id of the scenario. */
export const TEAM_ROLE = 'team'
export const ClassroomRubric = z.object({
  formatVersion: z.literal(1).default(1),
  id: Id,
  name: Name,
  role: z.string().trim().min(1).max(80),
  criteria: z.array(ClassroomRubricCriterion).min(1).max(CLASSROOM_LIMITS.criteria),
  /** Where the rubric text came from, e.g. "Original, Action Stations". */
  source: z.string().max(200).default(''),
})
export type ClassroomRubric = z.infer<typeof ClassroomRubric>

export const EVIDENCE_KINDS = ['observation', 'decision', 'hotwash', 'reflection'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

/** One piece of evidence about one student (FR-4). Time is exercise time, as everywhere else. */
export const Evidence = z.object({
  id: Id,
  kind: z.enum(EVIDENCE_KINDS),
  scenarioId: Id,
  sessionId: Id.optional(),
  studentId: Id,
  rubricId: Id.optional(),
  criterionId: Id.optional(),
  /** Index into the criterion's levels, for observations. */
  levelIndex: z.number().int().min(0).max(5).optional(),
  note: Note.default(''),
  exerciseTime: z
    .string()
    .regex(/^\d{1,2}:[0-5]\d$/)
    .optional(),
  injectRef: z.string().max(64).optional(),
  /** The anonymous observation in evaluation.json this entry links to. */
  observationId: z.string().max(64).optional(),
  /** Hot wash tally: contributions counted by the one-tap control. */
  count: z.number().int().min(1).max(1000).default(1),
  /** Decisions and messages: the seat that sent them. */
  seatId: z.string().max(64).optional(),
  at: IsoDateTime,
})
export type Evidence = z.infer<typeof Evidence>

export const ScoreEntry = z.object({
  scenarioId: Id,
  studentId: Id,
  rubricId: Id,
  criterionId: Id,
  /** The level the instructor chose; absent until they do (no automatic grade is final). */
  levelIndex: z.number().int().min(0).max(5).optional(),
  /** The rule-based suggestion at the time, with its basis, so an override stays explainable. */
  suggestedLevelIndex: z.number().int().min(0).max(5).optional(),
  basis: z.string().max(CLASSROOM_LIMITS.text).default(''),
  comment: z.string().max(CLASSROOM_LIMITS.note).default(''),
  scoredBy: z.string().max(60).optional(),
  /** Team criteria: true when the instructor set this student apart from the team score. */
  overridden: z.boolean().default(false),
  updatedAt: IsoDateTime,
})
export type ScoreEntry = z.infer<typeof ScoreEntry>

export const ClassroomSession = z.object({
  scenarioId: Id,
  sectionId: Id,
  /** Ungraded: evidence feeds the student's own report and nothing else. */
  practice: z.boolean().default(false),
  /** Seat id -> student id (spec 0418 seats). */
  seats: z.record(z.string(), Id).default({}),
  rubricIds: z.array(Id).max(20).default([]),
  /** Make-up of another session's scenario. */
  makeupOf: Id.optional(),
})
export type ClassroomSession = z.infer<typeof ClassroomSession>

export const RotationSession = z.object({
  index: z.number().int().min(0),
  scenarioId: Id.optional(),
  /** Student id -> role. */
  assignments: z.record(z.string(), z.string()),
})
export type RotationSession = z.infer<typeof RotationSession>

export const RotationPlan = z.object({
  id: Id,
  sectionId: Id,
  roles: z.array(z.string().min(1).max(80)).min(1).max(30),
  sessions: z.array(RotationSession).max(CLASSROOM_LIMITS.rotationSessions),
})
export type RotationPlan = z.infer<typeof RotationPlan>

export const PACKET_FORMATS = ['standard', 'screen_reader', 'large_print'] as const
/** Adjustments, not diagnoses (FR-11). Private to the instructor. */
export const Accommodation = z.object({
  studentId: Id,
  /** Applied to this student's timed responses, not the shared clock. */
  timeMultiplier: z.number().min(1).max(4).default(1),
  responseMethod: z.enum(['default', 'written', 'spoken']).default('default'),
  packet: z.enum(PACKET_FORMATS).default('standard'),
  breaks: z.boolean().default(false),
  /** Observer or evaluator role with an equivalent rubric. */
  quieterRole: z.boolean().default(false),
  note: z.string().max(CLASSROOM_LIMITS.text).default(''),
})
export type Accommodation = z.infer<typeof Accommodation>

/** classroom/course.json */
export const ClassroomCourseFile = z.looseObject({
  formatVersion: z.number().int().default(CLASSROOM_FORMAT_VERSION),
  course: Course.optional(),
  sections: z.array(Section).max(CLASSROOM_LIMITS.sections).default([]),
  students: z.array(Student).max(CLASSROOM_LIMITS.students).default([]),
  outcomes: z.array(Outcome).max(CLASSROOM_LIMITS.outcomes).default([]),
  mappings: z.array(OutcomeMapping).max(CLASSROOM_LIMITS.mappings).default([]),
  rubrics: z.array(ClassroomRubric).max(CLASSROOM_LIMITS.rubrics).default([]),
  sessions: z.array(ClassroomSession).max(CLASSROOM_LIMITS.sessions).default([]),
  rotations: z.array(RotationPlan).max(CLASSROOM_LIMITS.sections).default([]),
  /** Share of a criterion's top points at or above which an outcome counts as attained. */
  attainmentThreshold: z.number().min(0).max(1).default(0.6),
  updatedAt: IsoDateTime,
})
export type ClassroomCourseFile = z.infer<typeof ClassroomCourseFile>

/** classroom/evidence.json */
export const ClassroomEvidenceFile = z.looseObject({
  formatVersion: z.number().int().default(CLASSROOM_FORMAT_VERSION),
  evidence: z.array(Evidence).max(CLASSROOM_LIMITS.evidence).default([]),
  updatedAt: IsoDateTime,
})
export type ClassroomEvidenceFile = z.infer<typeof ClassroomEvidenceFile>

/** classroom/scores.json */
export const ClassroomScoresFile = z.looseObject({
  formatVersion: z.number().int().default(CLASSROOM_FORMAT_VERSION),
  scores: z.array(ScoreEntry).max(CLASSROOM_LIMITS.scores).default([]),
  updatedAt: IsoDateTime,
})
export type ClassroomScoresFile = z.infer<typeof ClassroomScoresFile>

/** classroom/accommodations.json */
export const ClassroomAccommodationsFile = z.looseObject({
  formatVersion: z.number().int().default(CLASSROOM_FORMAT_VERSION),
  accommodations: z.array(Accommodation).max(CLASSROOM_LIMITS.students).default([]),
  updatedAt: IsoDateTime,
})
export type ClassroomAccommodationsFile = z.infer<typeof ClassroomAccommodationsFile>

/** The error an evaluator form gets when a student id arrives while Classroom mode is off. */
export const STUDENT_ID_NEEDS_CLASSROOM =
  'Observations can name a student only when Classroom mode is on.'
