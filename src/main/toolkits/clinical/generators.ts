// The clinical case data generators (spec 0452 FR-7, spec 0448 FR-10): a named trajectory as
// simulated vitals and lab series, labeled simulated by the framework. Importing this module
// registers them.
import { z } from 'zod'
import { registerGenerator, type GeneratedDataset } from '../../case-data/generators'
import { generatePatient } from './patient'
import { ACTIONS, TRAJECTORY_KINDS, generateTrajectory } from './trajectory'

const Params = z.object({
  kind: z.enum(TRAJECTORY_KINDS),
  seed: z.number().int().default(1),
  /** ISO time of minute 0. */
  start: z.string().datetime(),
  durationMin: z.number().int().min(30).max(480).default(240),
  stepMin: z.number().int().min(5).max(60).default(15),
  actions: z
    .array(z.object({ atMin: z.number().int().min(0).max(480), action: z.enum(ACTIONS) }))
    .max(12)
    .default([]),
})
type Params = z.infer<typeof Params>

const at = (start: string, minute: number): string =>
  new Date(Date.parse(start) + minute * 60_000).toISOString()

export function clinicalTrajectoryDatasets(p: Params): GeneratedDataset[] {
  const t = generateTrajectory(p)
  const patient = generatePatient(p.seed, t.profile)
  return [
    {
      id: 'patient-vitals',
      label: `Vital signs (${t.label}, ${patient.name}, simulated)`,
      kind: 'series',
      data: t.steps.map((s) => ({ t: at(p.start, s.minute), v: { ...s.vitals } })),
      range: { start: at(p.start, 0), end: at(p.start, p.durationMin) },
    },
    {
      id: 'patient-labs',
      label: `Laboratory results (${t.label}, ${patient.name}, simulated)`,
      kind: 'series',
      data: t.labs.map((l) => ({ t: at(p.start, l.minute), v: { ...l.labs } })),
      range: { start: at(p.start, 0), end: at(p.start, p.durationMin) },
    },
  ]
}

registerGenerator({
  id: 'clinical-trajectory',
  label: 'Simulated patient trajectory (clinical care toolkit)',
  params: Params,
  generate: clinicalTrajectoryDatasets,
})
