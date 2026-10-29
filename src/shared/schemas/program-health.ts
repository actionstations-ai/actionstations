// The program health dashboard (#438, spec 0438): what `computeHealth` returns. Computed from the
// program folder's snapshots and corrective actions, never from the project folders themselves.
import { z } from 'zod'
import { CoreCapabilityId, MISSION_AREAS } from '../core-capabilities'
import { Id, IsoDateTime } from './common'
import { CorrectiveActionStatus, ExerciseType, IsoDate } from './program'
import { DocumentKind } from './project'

export const HEALTH_STALE_MONTHS = 24
export const HEALTH_SNAPSHOT_STALE_DAYS = 30

export const HealthFilter = z.object({
  projectIds: z.array(Id).max(500).optional(),
  years: z.array(z.number().int().min(1990).max(2200)).max(10).optional(),
  missionAreas: z.array(z.enum(MISSION_AREAS)).max(5).optional(),
  /** sha256 or normalized title; limits the plan-section panels. */
  documentKeys: z.array(z.string().max(300)).max(200).optional(),
  staleAfterMonths: z.number().int().min(1).max(120).optional(),
  includeOwners: z.boolean().optional(),
})
export type HealthFilter = z.infer<typeof HealthFilter>

export const ExerciseRef = z.object({
  projectId: Id,
  projectName: z.string(),
  scenarioId: Id,
  title: z.string(),
  exercisedAt: IsoDateTime.optional(),
  reachable: z.boolean(),
})
export type ExerciseRef = z.infer<typeof ExerciseRef>

export const ResultCounts = z.object({
  met: z.number().int(),
  partial: z.number().int(),
  notMet: z.number().int(),
  notObserved: z.number().int(),
})

export const CAPABILITY_STATUSES = ['never', 'stale', 'current', 'planned'] as const
export const CapabilityStatus = z.enum(CAPABILITY_STATUSES)
export type CapabilityStatus = z.infer<typeof CapabilityStatus>

export const CapabilityHealth = z.object({
  id: CoreCapabilityId,
  label: z.string(),
  missionAreas: z.array(z.enum(MISSION_AREAS)),
  status: CapabilityStatus,
  exercises: z.array(ExerciseRef),
  lastExercisedAt: IsoDateTime.optional(),
  inCycle: z.number().int(),
  results: ResultCounts.optional(),
  openActions: z.number().int(),
  overdueActions: z.number().int(),
  priorityIds: z.array(Id),
  plannedExerciseIds: z.array(Id),
  /** Exercises per quarter of the cycle, key "2026-Q2". */
  byQuarter: z.record(z.string(), z.number().int()),
  /** Planned exercises per quarter of the cycle that name the capability. */
  plannedByQuarter: z.record(z.string(), z.number().int()),
})
export type CapabilityHealth = z.infer<typeof CapabilityHealth>

export const SectionHealth = z.object({
  documentKey: z.string(),
  documentTitle: z.string(),
  documentKind: DocumentKind,
  /** Heading path after the document short name, to depth 3: "Section 13 › 13.6 FIDS". */
  headingPath: z.string(),
  depth: z.number().int(),
  timesCited: z.number().int(),
  lastCitedAt: IsoDateTime.optional(),
  exercises: z.array(ExerciseRef),
  openActions: z.number().int(),
  redlines: z.number().int().optional(),
  never: z.boolean(),
})
export type SectionHealth = z.infer<typeof SectionHealth>

export const OverdueAction = z.object({
  id: Id,
  label: z.string(),
  title: z.string(),
  dueDate: IsoDate,
  daysOverdue: z.number().int(),
  owner: z.string().optional(),
  organization: z.string(),
  coreCapabilities: z.array(CoreCapabilityId),
})

export const ActionsHealth = z.object({
  byStatus: z.record(CorrectiveActionStatus, z.number().int()),
  overdue: z.array(OverdueAction),
  ageing: z.object({
    under90: z.number().int(),
    d90to365: z.number().int(),
    over365: z.number().int(),
  }),
  byCapability: z.array(
    z.object({
      id: CoreCapabilityId,
      label: z.string(),
      open: z.number().int(),
      overdue: z.number().int(),
      verified: z.number().int(),
    }),
  ),
  byOwnerOrg: z.array(
    z.object({ organization: z.string(), open: z.number().int(), overdue: z.number().int() }),
  ),
  verifiedInCycle: z.number().int(),
})
export type ActionsHealth = z.infer<typeof ActionsHealth>

export const NeverTested = z.object({
  capabilities: z.array(
    z.object({ id: CoreCapabilityId, label: z.string(), priorityIds: z.array(Id) }),
  ),
  documents: z.array(
    z.object({
      documentKey: z.string(),
      documentTitle: z.string(),
      projectNames: z.array(z.string()),
    }),
  ),
  sections: z.array(SectionHealth),
  overduePlanned: z.array(
    z.object({ id: Id, title: z.string(), when: z.string(), type: ExerciseType }),
  ),
})
export type NeverTested = z.infer<typeof NeverTested>

export const TimelineEntry = z.object({
  quarter: z.string(),
  kind: z.enum(['exercise', 'planned', 'drill']),
  title: z.string(),
  type: ExerciseType.optional(),
  capabilities: z.number().int(),
  ref: ExerciseRef.optional(),
  plannedExerciseId: Id.optional(),
  drill: z
    .object({ pass: z.number().int(), fail: z.number().int(), partial: z.number().int() })
    .optional(),
})
export type TimelineEntry = z.infer<typeof TimelineEntry>

export const ProgramHealth = z.object({
  computedAt: IsoDateTime,
  filter: HealthFilter.required({ staleAfterMonths: true, includeOwners: true }),
  cycle: z.object({
    startYear: z.number().int(),
    years: z.number().int(),
    quarters: z.array(z.string()),
  }),
  freshness: z.array(
    z.object({
      projectId: Id,
      name: z.string(),
      takenAt: IsoDateTime,
      reachable: z.boolean(),
      stale: z.boolean(),
    }),
  ),
  capabilities: z.array(CapabilityHealth),
  sections: z.array(SectionHealth),
  actions: ActionsHealth,
  neverTested: NeverTested,
  timeline: z.array(TimelineEntry),
  /** Exercised scenarios with no Core Capability mapping (#421): in the timeline, not the matrix. */
  unmappedExercises: z.number().int(),
  totals: z.object({
    exercises: z.number().int(),
    capabilitiesCurrent: z.number().int(),
    capabilitiesNever: z.number().int(),
    sectionsCited: z.number().int(),
    sectionsNever: z.number().int(),
    openActions: z.number().int(),
    overdueActions: z.number().int(),
  }),
})
export type ProgramHealth = z.infer<typeof ProgramHealth>
