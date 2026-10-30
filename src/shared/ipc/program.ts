// program:* (#424): the exercise program folder, its corrective actions, schedule, snapshots,
// the AAR/IP import, the next-exercise proposal and the exports. Nothing here uses the network.
// Every channel except create/open names the program by `programPath`; main accepts only the
// active program or one in the recent list (src/main/program/guard.ts).
import { z } from 'zod'
import { channel } from './define'
import { patchOf, SafeId } from '../schemas/common'
import { HealthFilter, ProgramHealth } from '../schemas/program-health'
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

/** One row of a corrective-action CSV as the import would read it (#504). */
export const CsvImportRow = z.object({
  /** Line in the file (the header is line 1). */
  line: z.number().int(),
  title: z.string(),
  status: CorrectiveActionStatus,
  warnings: z.array(z.string()),
  /** Why the row cannot be imported; absent for a valid row. */
  error: z.string().optional(),
  /** An action with this title is already in the program; the row is skipped. */
  duplicate: z.boolean().optional(),
})
export type CsvImportRow = z.infer<typeof CsvImportRow>
export const CsvImportPreview = z.object({
  rows: z.array(CsvImportRow),
  ignoredColumns: z.array(z.string()),
})
export type CsvImportPreview = z.infer<typeof CsvImportPreview>
const CsvText = z.string().min(1).max(1_100_000)

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
  'health_pdf',
  'health_csv',
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
  /** Read a corrective-action CSV and show what would be imported; nothing is written. */
  'program:import-csv-preview': channel(R.extend({ csv: CsvText }), CsvImportPreview),
  /** Create an action for each valid, new row of the CSV. */
  'program:import-csv': channel(
    R.extend({ csv: CsvText }),
    z.object({ created: z.number().int(), skipped: z.number().int() }),
  ),
  'program:propose': channel(R, ExerciseProposal),
  /** The program health dashboard (#438), computed from the program's own files. */
  'program:health': channel(R.extend({ filter: HealthFilter.optional() }), ProgramHealth),
  'program:export': channel(
    R.extend({
      outDir: z.string().min(1),
      targets: z.array(ProgramExportTarget).min(1).max(EXPORT_TARGETS.length),
      /** Applies to the health_pdf and health_csv targets (#438). */
      filter: HealthFilter.optional(),
    }),
    z.object({ files: z.array(z.string()) }),
  ),
}
