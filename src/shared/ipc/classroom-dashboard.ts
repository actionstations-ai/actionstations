// Classroom gradebook export, dashboard and accommodation channels (#733, #736, #739).
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { Accommodation } from '../schemas/classroom'

const P = z.object({ projectPath: z.string().min(1) })

export const GradebookWarning = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('no-score'), student: z.string(), scenario: z.string() }),
  z.object({ kind: z.literal('missing-id'), student: z.string() }),
  z.object({ kind: z.literal('practice-excluded'), scenario: z.string() }),
  z.object({ kind: z.literal('no-students') }),
])
export type GradebookWarning = z.infer<typeof GradebookWarning>

export const GradebookResult = z.object({
  header: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  csv: z.string(),
  fileName: z.string(),
  warnings: z.array(GradebookWarning),
  layouts: z.array(z.object({ id: z.string(), name: z.string(), note: z.string() })),
})
export type GradebookResult = z.infer<typeof GradebookResult>

export const DashboardTable = z.object({
  id: z.string(),
  title: z.string(),
  header: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  csv: z.string(),
})
export type DashboardTable = z.infer<typeof DashboardTable>

export const DashboardSection = z.object({
  sectionId: SafeId,
  name: z.string(),
  students: z.number(),
  gradedRuns: z.number(),
  practiceRuns: z.number(),
  accommodations: z.number(),
  noScore: z.array(z.string()),
  missingEvidence: z.number(),
  participation: z.object({
    rows: z.array(
      z.object({
        name: z.string(),
        count: z.number(),
        share: z.number(),
        ratio: z.number(),
        belowHalf: z.boolean(),
      }),
    ),
    belowHalfCount: z.number(),
    caveat: z.string().nullable(),
  }),
  tables: z.array(DashboardTable),
})
export type DashboardSection = z.infer<typeof DashboardSection>

export const Dashboard = z.object({
  threshold: z.number(),
  sections: z.array(DashboardSection),
  reliability: z.object({
    raters: z.number(),
    pairs: z.number(),
    exact: z.number().nullable(),
    withinOne: z.number().nullable(),
    kappa: z.number().nullable(),
    icc: z.number().nullable(),
    caveat: z.string().nullable(),
    lowest: z.array(z.object({ criterion: z.string(), exact: z.number(), pairs: z.number() })),
    table: DashboardTable,
  }),
})
export type Dashboard = z.infer<typeof Dashboard>

export const SessionAccommodation = z.object({
  studentId: SafeId,
  name: z.string(),
  lines: z.array(z.string()),
})

export const classroomDashboardChannels = {
  /** Build the CSV in memory for the instructor to preview and save; nothing is sent anywhere. */
  'classroom:gradebook': channel(
    P.extend({
      sectionId: SafeId,
      layoutId: z.string().default('generic'),
      includeOutcomes: z.boolean().default(false),
      includeCriteria: z.boolean().default(false),
      includeComments: z.boolean().default(false),
    }),
    GradebookResult,
  ),
  'classroom:dashboard': channel(P, Dashboard),
  'classroom:accommodations': channel(P, z.array(Accommodation)),
  'classroom:set-accommodation': channel(
    P.extend({ accommodation: Accommodation }),
    z.array(Accommodation),
  ),
  /** The adjustments for the students seated in a session, for the set-up checklist. */
  'classroom:session-accommodations': channel(
    P.extend({ scenarioId: SafeId }),
    z.array(SessionAccommodation),
  ),
}
