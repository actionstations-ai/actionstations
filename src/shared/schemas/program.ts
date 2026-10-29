// The exercise program (#424, spec 0424): a folder the user chooses (`<Name>.asprogram/`) that
// holds the corrective actions of every linked project and the multi-year Integrated
// Preparedness Plan (IPP) schedule. Every file in it is JSON validated by these schemas, because
// the folder may sit on shared storage and be edited by other computers.
import { z } from 'zod'
import { CoreCapabilityId } from '../core-capabilities'
import { CapabilityElement } from './aar'
import { Citation, Id, IsoDateTime } from './common'
import { DocumentKind } from './project'

export const PROGRAM_FORMAT_VERSION = 1
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

const formatVersion = z
  .number()
  .int()
  .default(PROGRAM_FORMAT_VERSION)
  .refine((v) => v <= PROGRAM_FORMAT_VERSION, {
    message: `This program was saved by a newer version of Action Stations (format newer than ${PROGRAM_FORMAT_VERSION}). Update the app to open it.`,
  })

/** Caps: these files may come from shared storage. */
export const PROGRAM_LIMITS = {
  title: 200,
  text: 8000,
  short: 300,
  email: 320,
  list: 200,
  history: 500,
  projects: 500,
  exercises: 500,
} as const

export const ProgramProjectLink = z.object({
  projectId: Id,
  name: z.string().max(PROGRAM_LIMITS.short),
  /** POSIX-relative to the program folder's parent when possible, else absolute. */
  path: z.string().max(2000),
  linkedAt: IsoDateTime,
  lastSeenAt: IsoDateTime.optional(),
})
export type ProgramProjectLink = z.infer<typeof ProgramProjectLink>

export const PRIORITY_SOURCE_KINDS = [
  'aar',
  'thira_spr',
  'grant',
  'regulation',
  'leadership',
  'other',
] as const
export const PRIORITY_SOURCE_LABELS: Record<(typeof PRIORITY_SOURCE_KINDS)[number], string> = {
  aar: 'After-action report',
  thira_spr: 'THIRA / SPR',
  grant: 'Grant condition',
  regulation: 'Regulation',
  leadership: 'Leadership direction',
  other: 'Other',
}

export const ProgramPriority = z.object({
  id: Id,
  text: z.string().min(1).max(PROGRAM_LIMITS.short),
  coreCapabilities: z.array(CoreCapabilityId).max(32).default([]),
  rationale: z.string().max(PROGRAM_LIMITS.text).default(''),
  sources: z
    .array(
      z.object({
        kind: z.enum(PRIORITY_SOURCE_KINDS),
        ref: z.string().max(PROGRAM_LIMITS.short),
      }),
    )
    .max(20)
    .default([]),
})
export type ProgramPriority = z.infer<typeof ProgramPriority>

export const ProgramCycle = z.object({
  startYear: z.number().int().min(1990).max(2200),
  years: z.number().int().min(1).max(5),
})
export type ProgramCycle = z.infer<typeof ProgramCycle>

export const Program = z.looseObject({
  formatVersion,
  id: Id,
  name: z.string().min(1).max(PROGRAM_LIMITS.short),
  orgName: z.string().max(PROGRAM_LIMITS.short).default(''),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  appVersion: z.string(),
  cycle: ProgramCycle,
  priorities: z.array(ProgramPriority).max(PROGRAM_LIMITS.list).default([]),
  projects: z.array(ProgramProjectLink).max(PROGRAM_LIMITS.projects).default([]),
  /** The next corrective action number ("CA-0007"); kept here so numbers are never reused. */
  nextActionNumber: z.number().int().min(1).default(1),
  /** Write the advisory presence lock (.lock.json) while the program is open. */
  lock: z.boolean().default(true),
})
export type Program = z.infer<typeof Program>

export const CORRECTIVE_ACTION_STATUSES = [
  'open',
  'in_progress',
  'completed',
  'verified',
  'deferred',
  'cancelled',
] as const
export const CorrectiveActionStatus = z.enum(CORRECTIVE_ACTION_STATUSES)
export type CorrectiveActionStatus = z.infer<typeof CorrectiveActionStatus>

export const CORRECTIVE_ACTION_STATUS_LABELS: Record<CorrectiveActionStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  verified: 'Verified',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
}

export const CorrectiveActionSource = z.object({
  kind: z.enum(['aar_ip', 'drill', 'manual']),
  projectId: Id.optional(),
  projectName: z.string().max(PROGRAM_LIMITS.short).optional(),
  scenarioId: Id.optional(),
  scenarioTitle: z.string().max(PROGRAM_LIMITS.short).optional(),
  exerciseDate: IsoDate.optional(),
  /** `<finding id>/<corrective action id>` of the AAR/IP item this came from (#419). */
  aarItemId: z.string().max(300).optional(),
  importId: Id.optional(),
})
export type CorrectiveActionSource = z.infer<typeof CorrectiveActionSource>

/** A plan section reference that survives the project being unreachable or re-ingested. */
export const PlanSectionRef = Citation.extend({ documentSha256: z.string().max(100).optional() })
export type PlanSectionRef = z.infer<typeof PlanSectionRef>

export const CorrectiveActionVerification = z.object({
  method: z.enum(['drill', 'exercise', 'review']),
  at: IsoDateTime,
  result: z.enum(['pass', 'partial', 'fail']),
  projectId: Id.optional(),
  scenarioId: Id.optional(),
  /** A drill run (#431). */
  drillRunId: Id.optional(),
  note: z.string().max(PROGRAM_LIMITS.text).default(''),
})
export type CorrectiveActionVerification = z.infer<typeof CorrectiveActionVerification>

export const CorrectiveActionOwner = z.object({
  name: z.string().max(PROGRAM_LIMITS.short).default(''),
  organization: z.string().max(PROGRAM_LIMITS.short).default(''),
  email: z.string().max(PROGRAM_LIMITS.email).default(''),
})

export const StatusChange = z.object({
  at: IsoDateTime,
  from: CorrectiveActionStatus.optional(),
  to: CorrectiveActionStatus,
  note: z.string().max(PROGRAM_LIMITS.text).default(''),
})
export type StatusChange = z.infer<typeof StatusChange>

export const ProgramAction = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  /** Shown as "CA-0007". */
  number: z.number().int().min(1).optional(),
  programId: Id,
  title: z.string().min(1).max(PROGRAM_LIMITS.title),
  description: z.string().max(PROGRAM_LIMITS.text).default(''),
  areaForImprovement: z.string().max(PROGRAM_LIMITS.text).default(''),
  coreCapabilities: z.array(CoreCapabilityId).max(32).default([]),
  /** HSEEP capability element: planning, organization, equipment, training, exercises. */
  element: CapabilityElement.optional(),
  planSections: z.array(PlanSectionRef).max(PROGRAM_LIMITS.list).default([]),
  owner: CorrectiveActionOwner.default({ name: '', organization: '', email: '' }),
  dueDate: IsoDate.optional(),
  startDate: IsoDate.optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  status: CorrectiveActionStatus.default('open'),
  history: z.array(StatusChange).max(PROGRAM_LIMITS.history).default([]),
  source: CorrectiveActionSource,
  verifications: z.array(CorrectiveActionVerification).max(PROGRAM_LIMITS.list).default([]),
  /** Redlines made for this action (#431). */
  redlineIds: z.array(Id).max(PROGRAM_LIMITS.list).default([]),
  notes: z.string().max(PROGRAM_LIMITS.text).default(''),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type ProgramAction = z.infer<typeof ProgramAction>

/** A corrective action as listed: the action plus the revision a save must be based on. */
export const CorrectiveActionView = z.object({ action: ProgramAction, revision: z.string() })
export type CorrectiveActionView = z.infer<typeof CorrectiveActionView>

export const EXERCISE_TYPES = [
  'seminar',
  'workshop',
  'tabletop',
  'game',
  'drill',
  'functional',
  'full_scale',
] as const
export const ExerciseType = z.enum(EXERCISE_TYPES)
export type ExerciseType = z.infer<typeof ExerciseType>

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  seminar: 'Seminar',
  workshop: 'Workshop',
  tabletop: 'Tabletop exercise',
  game: 'Game',
  drill: 'Drill',
  functional: 'Functional exercise',
  full_scale: 'Full-scale exercise',
}

export const PlannedExercise = z.object({
  id: Id,
  title: z.string().min(1).max(PROGRAM_LIMITS.title),
  type: ExerciseType,
  when: z.union([
    z.object({
      year: z.number().int().min(1990).max(2200),
      quarter: z.number().int().min(1).max(4),
    }),
    z.object({ date: IsoDate }),
  ]),
  status: z.enum(['planned', 'scheduled', 'completed', 'cancelled']).default('planned'),
  priorityIds: z.array(Id).max(PROGRAM_LIMITS.list).default([]),
  coreCapabilities: z.array(CoreCapabilityId).max(32).default([]),
  planSections: z.array(PlanSectionRef).max(PROGRAM_LIMITS.list).default([]),
  correctiveActionIds: z.array(Id).max(PROGRAM_LIMITS.list).default([]),
  projectId: Id.optional(),
  scenarioId: Id.optional(),
  completedAt: IsoDate.optional(),
  notes: z.string().max(PROGRAM_LIMITS.text).default(''),
})
export type PlannedExercise = z.infer<typeof PlannedExercise>

export const Schedule = z.looseObject({
  formatVersion: z.number().int().default(1),
  exercises: z.array(PlannedExercise).max(PROGRAM_LIMITS.exercises).default([]),
})
export type Schedule = z.infer<typeof Schedule>

export const AarImport = z.object({
  id: Id,
  at: IsoDateTime,
  projectId: Id,
  scenarioId: Id,
  aarSha256: z.string(),
  items: z.array(
    z.object({
      aarItemId: z.string().max(300),
      correctiveActionId: Id,
      action: z.enum(['created', 'updated', 'skipped']),
      /** Hash of the AAR text this item had when imported, to detect a later change. */
      contentSha256: z.string().optional(),
    }),
  ),
})
export type AarImport = z.infer<typeof AarImport>

export const SnapshotScenario = z.object({
  scenarioId: Id,
  title: z.string(),
  status: z.enum(['draft', 'ready', 'archived']),
  threatFamily: z.string().optional(),
  /** Latest live session end, else latest delivered row, else absent (built but not run). */
  exercisedAt: IsoDateTime.optional(),
  coreCapabilities: z.array(CoreCapabilityId),
  planSections: z.array(PlanSectionRef),
  ratings: z
    .object({
      met: z.number().int(),
      partial: z.number().int(),
      notMet: z.number().int(),
      notObserved: z.number().int(),
    })
    .optional(),
  aarPresent: z.boolean(),
})
export type SnapshotScenario = z.infer<typeof SnapshotScenario>

/** What the program keeps about a project so the dashboard (#438) works without the folder. */
export const ProjectSnapshot = z.looseObject({
  formatVersion: z.number().int().default(1),
  projectId: Id,
  name: z.string(),
  orgName: z.string(),
  orgType: z.string(),
  takenAt: IsoDateTime,
  reachable: z.boolean(),
  documents: z.array(
    z.object({
      id: Id,
      title: z.string(),
      shortName: z.string().optional(),
      kind: DocumentKind,
      sha256: z.string().optional(),
      /** Top-level headings, from the document's index. */
      sections: z.array(z.string()),
    }),
  ),
  scenarios: z.array(SnapshotScenario),
})
export type ProjectSnapshot = z.infer<typeof ProjectSnapshot>

export const LockInfo = z.object({
  host: z.string().max(200),
  user: z.string().max(200),
  pid: z.number().int().optional(),
  at: IsoDateTime,
  /** Random per app run; lets a window tell its own lock from another's. */
  holder: z.string().max(100).optional(),
  /** Whoever held the lock when this one was written: both have the program open. */
  previous: z
    .object({ host: z.string().max(200), user: z.string().max(200), at: IsoDateTime })
    .optional(),
})
export type LockInfo = z.infer<typeof LockInfo>

export const RecentProgram = z.object({
  path: z.string(),
  name: z.string(),
  openedAt: IsoDateTime,
})
export type RecentProgram = z.infer<typeof RecentProgram>

export const ProgramSettings = z.object({
  activePath: z.string().optional(),
  recent: z.array(RecentProgram).max(10).default([]),
})
export type ProgramSettings = z.infer<typeof ProgramSettings>

/** One ranked capability or plan section in a proposal, with the reasons behind its score. */
export const ProposalItem = z.object({
  /** Core Capability id, or `<documentId>|<headingPath>` for a plan section. */
  key: z.string(),
  label: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
})
export type ProposalItem = z.infer<typeof ProposalItem>

/** What the next exercise should test (FR-10): deterministic, ranked and explained. */
export const ExerciseProposal = z.object({
  capabilities: z.array(ProposalItem),
  planSections: z.array(ProposalItem),
  correctiveActionIds: z.array(Id),
  /** Sentences for ScenarioBrief.constraints; they carry no owner names. */
  suggestedConstraints: z.array(z.string()),
})
export type ExerciseProposal = z.infer<typeof ExerciseProposal>
