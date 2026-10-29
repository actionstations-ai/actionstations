// program:* (#424): the exercise program folder, its corrective actions, schedule, snapshots,
// the AAR/IP import, the next-exercise proposal and the exports. Nothing here uses the network.
// Every channel except create/open names the program by `programPath`; main accepts only the
// active program or one in the recent list (src/main/program/guard.ts).
import { z } from 'zod'
import { channel } from './define'
import { patchOf, SafeId } from '../schemas/common'
import {
  AarImport,
  CorrectiveActionStatus,
  CorrectiveActionVerification,
  CorrectiveActionView,
  ExerciseProposal,
  LockInfo,
  Program,
  ProgramAction,
  ProjectSnapshot,
  Schedule,
  IsoDate,
} from '../schemas/program'

const R = z.object({ programPath: z.string().min(1) })

export const OpenProgram = z.object({
  path: z.string(),
  program: Program,
  schedule: Schedule,
  /** Revision a schedule save must be based on. */
  scheduleRevision: z.string(),
  /** Another computer has the program open (advisory; editing continues). */
  lock: LockInfo.optional(),
  /** Whether each linked project's folder could be found (by project id). */
  reachable: z.record(z.string(), z.boolean()).default({}),
  /** Where each reachable linked project is on this computer, by project id. */
  projectPaths: z.record(z.string(), z.string()).default({}),
})
export type OpenProgram = z.infer<typeof OpenProgram>

export const ActionFilter = z.object({
  statuses: z.array(CorrectiveActionStatus).max(6).optional(),
  capability: z.string().max(100).optional(),
  ownerName: z.string().max(300).optional(),
  projectId: SafeId.optional(),
  overdueOnly: z.boolean().optional(),
})
export type ActionFilter = z.infer<typeof ActionFilter>

export const ActionList = z.object({
  actions: z.array(CorrectiveActionView),
  /** Files in corrective-actions/ that could not be read. */
  problems: z.array(z.string()),
})
export type ActionList = z.infer<typeof ActionList>

const ProposedAction = patchOf(
  ProgramAction.pick({
    title: true,
    description: true,
    areaForImprovement: true,
    coreCapabilities: true,
    element: true,
    planSections: true,
    owner: true,
    startDate: true,
    dueDate: true,
    status: true,
    source: true,
  }),
)

export const AarImportPreview = z.array(
  z.object({
    aarItemId: z.string(),
    areaForImprovement: z.string(),
    proposed: ProposedAction,
    state: z.enum(['new', 'imported', 'changed']),
    existingId: SafeId.optional(),
  }),
)
export type AarImportPreview = z.infer<typeof AarImportPreview>

export const AarImportSelection = z.object({
  aarItemId: z.string().max(300),
  include: z.boolean(),
  overrides: patchOf(
    ProgramAction.pick({
      title: true,
      description: true,
      owner: true,
      dueDate: true,
      priority: true,
      coreCapabilities: true,
    }),
  ).default({}),
})
export type AarImportSelection = z.infer<typeof AarImportSelection>

export const EXPORT_TARGETS = [
  'ip_docx',
  'ip_pdf',
  'ip_csv',
  'ipp_docx',
  'ipp_pdf',
  'ipp_csv',
  'zip',
] as const
export const ProgramExportTarget = z.enum(EXPORT_TARGETS)
export type ProgramExportTarget = z.infer<typeof ProgramExportTarget>

export const programChannels = {
  'program:create': channel(
    z.object({
      parentDir: z.string().min(1),
      name: z.string().min(1).max(120),
      orgName: z.string().max(300).default(''),
      startYear: z.number().int().min(1990).max(2200),
      years: z.number().int().min(1).max(5).default(3),
    }),
    OpenProgram,
  ),
  'program:open': channel(R, OpenProgram),
  'program:get': channel(R, OpenProgram),
  'program:close': channel(z.void(), z.void()),
  'program:update': channel(
    R.extend({
      patch: patchOf(
        Program.pick({ name: true, orgName: true, cycle: true, priorities: true, lock: true }),
      ),
      baseUpdatedAt: z.string().optional(),
    }),
    OpenProgram,
  ),
  'program:link-project': channel(R.extend({ projectPath: z.string().min(1) }), OpenProgram),
  'program:unlink-project': channel(R.extend({ projectId: SafeId }), OpenProgram),
  /** Re-read the linked projects and rewrite their snapshots. */
  'program:refresh': channel(R.extend({ projectIds: z.array(SafeId).optional() }), z.void()),
  'program:snapshots': channel(R, z.array(ProjectSnapshot)),
  'program:actions-list': channel(R.extend({ filter: ActionFilter.optional() }), ActionList),
  'program:action-get': channel(R.extend({ id: SafeId }), CorrectiveActionView),
  /** CONFLICT carries `details.theirs` (the stored view). A new id creates the action. */
  'program:action-save': channel(
    R.extend({ action: ProgramAction, baseRevision: z.string().optional() }),
    CorrectiveActionView,
  ),
  'program:action-status': channel(
    R.extend({
      ids: z.array(SafeId).min(1).max(500),
      to: CorrectiveActionStatus,
      note: z.string().max(8000).default(''),
      verification: CorrectiveActionVerification.optional(),
    }),
    z.array(CorrectiveActionView),
  ),
  'program:action-bulk': channel(
    R.extend({
      ids: z.array(SafeId).min(1).max(500),
      patch: z.object({
        ownerName: z.string().max(300).optional(),
        ownerOrganization: z.string().max(300).optional(),
        dueDate: IsoDate.optional(),
        priority: z.enum(['high', 'medium', 'low']).optional(),
      }),
    }),
    z.array(CorrectiveActionView),
  ),
  'program:action-delete': channel(R.extend({ id: SafeId }), z.void()),
  'program:schedule-save': channel(
    R.extend({ schedule: Schedule, baseRevision: z.string().optional() }),
    z.object({ schedule: Schedule, revision: z.string() }),
  ),
  'program:import-aar-preview': channel(
    R.extend({ projectPath: z.string().min(1), scenarioId: SafeId }),
    AarImportPreview,
  ),
  'program:import-aar': channel(
    R.extend({
      projectPath: z.string().min(1),
      scenarioId: SafeId,
      items: z.array(AarImportSelection).max(500),
    }),
    AarImport,
  ),
  'program:propose': channel(R, ExerciseProposal),
  'program:export': channel(
    R.extend({
      outDir: z.string().min(1),
      targets: z.array(ProgramExportTarget).min(1).max(EXPORT_TARGETS.length),
    }),
    z.object({ files: z.array(z.string()) }),
  ),
}
