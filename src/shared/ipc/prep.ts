// PREP exercise support over IPC (spec 0455 FR-10, #782): the core-component coverage of a
// project's PREP exercises and the exercise record as a PDF in the project's exports folder.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { CORE_COMPONENT_IDS } from '../prep'

const Component = z.enum(CORE_COMPONENT_IDS)

export const PrepExerciseSummary = z.object({
  scenarioId: SafeId,
  title: z.string(),
  /** First exercise date (YYYY-MM-DD); empty when the scenario has none yet. */
  date: z.string(),
  components: z.array(Component),
})
export type PrepExerciseSummary = z.infer<typeof PrepExerciseSummary>

export const PrepCoverage = z.object({
  /** The project's PREP exercises that fall in the cycle (all of them without a cycle start). */
  exercises: z.array(PrepExerciseSummary),
  covered: z.number().int(),
  applicable: z.number().int(),
  percent: z.number().int(),
  missing: z.array(Component),
  /** One line saying where the scenario falls in its exercise cycle; empty without a cycle start. */
  cycleLine: z.string(),
})
export type PrepCoverage = z.infer<typeof PrepCoverage>

export const prepChannels = {
  /** Coverage of the 15 core components by the project's PREP exercises, for one scenario's cycle. */
  'prep:coverage': channel(
    z.object({ projectPath: z.string().min(1), scenarioId: SafeId }),
    PrepCoverage,
  ),
  /** Render the scenario's PREP exercise record to <project>/exports; returns the file path. */
  'prep:record': channel(
    z.object({ projectPath: z.string().min(1), scenarioId: SafeId }),
    z.object({ path: z.string(), fileName: z.string() }),
  ),
}
