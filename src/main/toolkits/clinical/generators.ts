// The clinical case data generators (spec 0452 FR-7, spec 0448 FR-10): a named trajectory as
// simulated vitals and lab series, labeled simulated by the framework, and the events the
// escalation measure compares the nurses' calls with (issue #1131): the first early warning score
// that needs an urgent review and the first critical laboratory value. register.ts registers it.
import { z } from 'zod'
import type { GroundTruthEvent } from '@shared/schemas/metrics'
import { NEUTRAL_EWS, computeEws } from '@shared/clinical/ews'
import { LAB_RANGES, flagFor } from '@shared/clinical/reference'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { generatePatient } from './patient'
import {
  ACTIONS,
  TRAJECTORY_KINDS,
  ewsReadingAt,
  generateTrajectory,
  type LabKey,
  type Trajectory,
} from './trajectory'

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

/** The ground-truth dataset of a simulated patient's events. */
export const PATIENT_EVENTS_DATASET = 'patient-events'

/** The neutral score's total from which the response is an urgent review (the "Medium" band). */
const URGENT_REVIEW_TOTAL = 5
/** Lactate has no entry in the reference ranges; 4 mmol/L is the common critical call value. */
const LACTATE_CRITICAL = 4

const at = (start: string, minute: number): string =>
  new Date(Date.parse(start) + minute * 60_000).toISOString()

function criticalLab(key: LabKey, value: number): string | undefined {
  if (key === 'lactate') return value >= LACTATE_CRITICAL ? 'Lactate' : undefined
  const range = LAB_RANGES.find((r) => r.id === key)
  return range && flagFor(range, value) === 'critical' ? range.name : undefined
}

/** The first urgent early warning score and the first critical lab of a trajectory. */
export function trajectoryEvents(
  t: Trajectory,
  start: string,
  patient: string,
): GroundTruthEvent[] {
  const out: GroundTruthEvent[] = []
  for (const step of t.steps) {
    const ews = computeEws(NEUTRAL_EWS, ewsReadingAt(t, step.minute))
    if (ews.trigger.minTotal < URGENT_REVIEW_TOTAL) continue
    out.push({
      id: 'ews-1',
      time: at(start, step.minute),
      kind: 'abnormal_early_warning_score',
      attrs: { patient, score: ews.total, level: ews.trigger.level, simulated: true },
    })
    break
  }
  for (const draw of t.labs) {
    const hit = (Object.entries(draw.labs) as [LabKey, number][])
      .map(([k, v]) => ({ test: criticalLab(k, v), value: v }))
      .find((x) => x.test)
    if (!hit) continue
    out.push({
      id: 'critical-lab-1',
      time: at(start, draw.minute),
      kind: 'critical_lab',
      attrs: { patient, test: hit.test, value: hit.value, simulated: true },
    })
    break
  }
  return out
}

export function clinicalTrajectoryDatasets(p: Params): GeneratedDataset[] {
  const t = generateTrajectory(p)
  const patient = generatePatient(p.seed, t.profile)
  const range = { start: at(p.start, 0), end: at(p.start, p.durationMin) }
  return [
    {
      id: 'patient-vitals',
      label: `Vital signs (${t.label}, ${patient.name}, simulated)`,
      kind: 'series',
      data: t.steps.map((s) => ({ t: at(p.start, s.minute), v: { ...s.vitals } })),
      range,
    },
    {
      id: 'patient-labs',
      label: `Laboratory results (${t.label}, ${patient.name}, simulated)`,
      kind: 'series',
      data: t.labs.map((l) => ({ t: at(p.start, l.minute), v: { ...l.labs } })),
      range,
    },
    {
      id: PATIENT_EVENTS_DATASET,
      label: `Escalation events (${t.label}, ${patient.name}, simulated)`,
      kind: 'reports',
      shape: 'ground-truth',
      data: trajectoryEvents(t, p.start, patient.name),
      range,
    },
  ]
}

export const clinicalTrajectoryGenerator: SimulatedGenerator<Params> = {
  id: 'clinical-trajectory',
  label: 'Simulated patient trajectory (clinical care toolkit)',
  params: Params,
  description:
    'One fictional patient on a named course (sepsis, hemorrhage, respiratory failure and others) whose vital signs and labs change over the shift, and whose course the learner actions bend. It writes the vitals and lab series and the escalation events: the first early warning score that needs an urgent review and the first critical lab value.',
  toolkits: ['clinical_care'],
  example: {
    kind: 'sepsis',
    seed: 1,
    start: '2026-11-12T07:00:00Z',
    durationMin: 240,
    stepMin: 15,
    actions: [
      { atMin: 60, action: 'reassess' },
      { atMin: 90, action: 'escalate' },
    ],
  } satisfies z.input<typeof Params>,
  fields: {
    kind: {
      label: 'Trajectory',
      help: 'sepsis, hemorrhage, respiratory_failure, cardiac_event, postoperative_deterioration or hypoglycemia.',
    },
    seed: {
      label: 'Random seed',
      help: 'Any whole number; the same seed gives the same patient and values.',
    },
    start: { label: 'Start (UTC)', help: 'Minute 0 of the case, as an ISO date and time.' },
    durationMin: { label: 'Length (minutes)', help: '30 to 480 minutes.' },
    stepMin: { label: 'Vital signs every (minutes)', help: '5 to 60 minutes between readings.' },
    actions: {
      label: 'Learner actions',
      help: 'JSON list of { atMin, action }, where action is reassess, escalate, treat or delay (up to 12). Each changes the course from that minute.',
    },
  },
  generate: clinicalTrajectoryDatasets,
}
