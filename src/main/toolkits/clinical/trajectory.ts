// Physiologic trajectories (spec 0452 FR-7): named courses (sepsis, hemorrhage, respiratory
// failure, cardiac event, post-operative deterioration, hypoglycemia) that turn a seed and the
// learner's actions into consistent vital signs and lab time series. A trajectory is a severity
// from 0 (baseline) to 1 (severe) that rises at a rate of its own; vitals and labs are the baseline
// plus severity times the distance to their severe value, with small seeded noise, clamped to
// human ranges. At branch points the learner's action changes the course: reassessing changes
// nothing (and says so), escalating makes treatment available sooner, treating reverses the rise
// once escalated, delaying speeds it. Rule-based, not a physiologic model. Deterministic given the
// seed. Values are typical adult magnitudes for exercises, never a real patient's; refining them
// against open reference data (MIMIC-IV demo) is a later check.
import { rng, type PatientProfile } from './patient'

export const TRAJECTORY_KINDS = [
  'sepsis',
  'hemorrhage',
  'respiratory_failure',
  'cardiac_event',
  'postoperative_deterioration',
  'hypoglycemia',
] as const
export type TrajectoryKind = (typeof TRAJECTORY_KINDS)[number]

export const VITAL_KEYS = [
  'heart_rate',
  'systolic_bp',
  'diastolic_bp',
  'respiratory_rate',
  'oxygen_saturation',
  'temperature',
] as const
export type VitalKey = (typeof VITAL_KEYS)[number]
export type Vitals = Record<VitalKey, number>

export type LabKey =
  'lactate' | 'creatinine' | 'potassium' | 'glucose' | 'hemoglobin' | 'troponin' | 'wbc'
export type Labs = Partial<Record<LabKey, number>>

/** Plausible human limits; a generated value is clamped into them. */
export const VITAL_LIMITS: Record<VitalKey, [number, number]> = {
  heart_rate: [30, 200],
  systolic_bp: [50, 230],
  diastolic_bp: [25, 130],
  respiratory_rate: [6, 45],
  oxygen_saturation: [70, 100],
  temperature: [34, 41.5],
}
const DECIMALS: Record<VitalKey, number> = {
  heart_rate: 0,
  systolic_bp: 0,
  diastolic_bp: 0,
  respiratory_rate: 0,
  oxygen_saturation: 0,
  temperature: 1,
}
const NOISE: Record<VitalKey, number> = {
  heart_rate: 2,
  systolic_bp: 3,
  diastolic_bp: 2,
  respiratory_rate: 1,
  oxygen_saturation: 0.6,
  temperature: 0.1,
}

export const ACTIONS = ['reassess', 'escalate', 'treat', 'delay'] as const
export type LearnerAction = (typeof ACTIONS)[number]

export interface BranchPoint {
  atMin: number
  /** What the learner is asked at this point. */
  prompt: string
  /** What each action does, in words, for the key and the debrief. */
  effects: Record<LearnerAction, string>
}

interface Definition {
  label: string
  profile: PatientProfile
  baseline: Vitals
  severe: Vitals
  baselineLabs: Labs
  severeLabs: Labs
  /** Severity gained per minute while untreated. */
  rise: number
  /** Minutes before the course starts to rise. */
  onsetMin: number
  branchPoints: BranchPoint[]
  /** The treatment named in the case key (within a nurse's scope or by order). */
  treatment: string
  /** Typical-range source note, for the chart and the key. */
  source: string
}

const SOURCE =
  'Typical adult magnitudes for exercises; not a real patient. Reference-data refinement pending.'

const ALL_EFFECTS = (escalate: string, treat: string): BranchPoint['effects'] => ({
  reassess:
    'Repeat the vital signs and the assessment. Nothing changes in the patient; the trend becomes clearer.',
  escalate,
  treat,
  delay: 'Wait and recheck later. The course continues to worsen faster than before.',
})

export const DEFINITIONS: Record<TrajectoryKind, Definition> = {
  sepsis: {
    label: 'Sepsis',
    profile: 'postoperative',
    baseline: {
      heart_rate: 84,
      systolic_bp: 122,
      diastolic_bp: 74,
      respiratory_rate: 16,
      oxygen_saturation: 97,
      temperature: 37.2,
    },
    severe: {
      heart_rate: 128,
      systolic_bp: 80,
      diastolic_bp: 48,
      respiratory_rate: 28,
      oxygen_saturation: 90,
      temperature: 39.1,
    },
    baselineLabs: { lactate: 1.1, creatinine: 1.0, wbc: 9, glucose: 112, potassium: 4.2 },
    severeLabs: { lactate: 5.0, creatinine: 2.1, wbc: 19, glucose: 168, potassium: 5.3 },
    rise: 1 / 180,
    onsetMin: 30,
    treatment: 'Fluid bolus, cultures and antibiotics as ordered, oxygen',
    source: SOURCE,
    branchPoints: [
      {
        atMin: 60,
        prompt: 'Temperature and heart rate are up and blood pressure is drifting down.',
        effects: ALL_EFFECTS(
          'Call the provider with a structured report; orders can start earlier.',
          'Start oxygen and recheck; without an order for fluids the course slows only a little.',
        ),
      },
      {
        atMin: 120,
        prompt:
          'The early warning score has crossed the trigger and the patient is newly confused.',
        effects: ALL_EFFECTS(
          'Call rapid response; the team can order fluids, cultures and antibiotics.',
          'With escalation done, give the ordered fluid bolus and antibiotics; the course starts to reverse.',
        ),
      },
    ],
  },
  hemorrhage: {
    label: 'Hemorrhage',
    profile: 'surgical_bleed',
    baseline: {
      heart_rate: 80,
      systolic_bp: 124,
      diastolic_bp: 76,
      respiratory_rate: 16,
      oxygen_saturation: 98,
      temperature: 36.9,
    },
    severe: {
      heart_rate: 138,
      systolic_bp: 74,
      diastolic_bp: 42,
      respiratory_rate: 28,
      oxygen_saturation: 93,
      temperature: 36.2,
    },
    baselineLabs: { hemoglobin: 12.4, lactate: 1.0, creatinine: 0.9 },
    severeLabs: { hemoglobin: 6.8, lactate: 4.6, creatinine: 1.6 },
    rise: 1 / 100,
    onsetMin: 15,
    treatment: 'Direct pressure, stop anticoagulants per order, blood products as ordered',
    source: SOURCE,
    branchPoints: [
      {
        atMin: 30,
        prompt: 'Heart rate is rising, blood pressure is falling and the dressing is wet.',
        effects: ALL_EFFECTS(
          'Call the surgical team; blood can be ordered sooner.',
          'Apply pressure and hold anticoagulants; slows the loss but does not stop it.',
        ),
      },
      {
        atMin: 60,
        prompt: 'The patient is pale, cool and anxious; systolic pressure is below 90.',
        effects: ALL_EFFECTS(
          'Call rapid response and the surgeon; the team can transfuse and return to the operating room.',
          'With escalation done, blood products run and the loss is controlled; the course reverses.',
        ),
      },
    ],
  },
  respiratory_failure: {
    label: 'Respiratory failure',
    profile: 'medical',
    baseline: {
      heart_rate: 88,
      systolic_bp: 132,
      diastolic_bp: 78,
      respiratory_rate: 18,
      oxygen_saturation: 95,
      temperature: 37.0,
    },
    severe: {
      heart_rate: 122,
      systolic_bp: 150,
      diastolic_bp: 90,
      respiratory_rate: 36,
      oxygen_saturation: 82,
      temperature: 37.8,
    },
    baselineLabs: { lactate: 1.2, potassium: 4.1 },
    severeLabs: { lactate: 3.4, potassium: 4.6 },
    rise: 1 / 150,
    onsetMin: 20,
    treatment: 'Increase oxygen, sit the patient up, respiratory therapy and ordered treatments',
    source: SOURCE,
    branchPoints: [
      {
        atMin: 45,
        prompt: 'Breathing is faster and oxygen saturation is falling on the same oxygen.',
        effects: ALL_EFFECTS(
          'Call the provider and respiratory therapy.',
          'Sit the patient up and raise oxygen; saturation improves briefly.',
        ),
      },
      {
        atMin: 90,
        prompt: 'The patient is speaking in short phrases with a respiratory rate above 30.',
        effects: ALL_EFFECTS(
          'Call rapid response; the team can start non-invasive ventilation.',
          'With escalation done, ordered treatments and ventilatory support start; the course reverses.',
        ),
      },
    ],
  },
  cardiac_event: {
    label: 'Cardiac event',
    profile: 'cardiac',
    baseline: {
      heart_rate: 76,
      systolic_bp: 136,
      diastolic_bp: 80,
      respiratory_rate: 16,
      oxygen_saturation: 97,
      temperature: 36.8,
    },
    severe: {
      heart_rate: 112,
      systolic_bp: 98,
      diastolic_bp: 62,
      respiratory_rate: 24,
      oxygen_saturation: 92,
      temperature: 36.8,
    },
    baselineLabs: { troponin: 0.01, potassium: 4.0, creatinine: 1.0 },
    severeLabs: { troponin: 2.4, potassium: 4.3, creatinine: 1.3 },
    rise: 1 / 120,
    onsetMin: 10,
    treatment: 'Rest, oxygen if low, 12-lead ECG and ordered medications',
    source: SOURCE,
    branchPoints: [
      {
        atMin: 30,
        prompt: 'The patient reports chest pressure with sweating; heart rate is rising.',
        effects: ALL_EFFECTS(
          'Call the provider with the symptoms and an ECG; orders start sooner.',
          'Rest the patient and apply oxygen if low; symptoms ease slightly.',
        ),
      },
      {
        atMin: 70,
        prompt: 'The pain continues and blood pressure is falling.',
        effects: ALL_EFFECTS(
          'Call rapid response and the cardiology team.',
          'With escalation done, ordered medications and transfer begin; the course reverses.',
        ),
      },
    ],
  },
  postoperative_deterioration: {
    label: 'Post-operative deterioration',
    profile: 'postoperative',
    baseline: {
      heart_rate: 82,
      systolic_bp: 120,
      diastolic_bp: 72,
      respiratory_rate: 16,
      oxygen_saturation: 96,
      temperature: 37.1,
    },
    severe: {
      heart_rate: 118,
      systolic_bp: 92,
      diastolic_bp: 56,
      respiratory_rate: 26,
      oxygen_saturation: 91,
      temperature: 38.6,
    },
    baselineLabs: { hemoglobin: 11.8, lactate: 1.2, wbc: 10, creatinine: 1.0 },
    severeLabs: { hemoglobin: 9.2, lactate: 3.6, wbc: 16, creatinine: 1.7 },
    rise: 1 / 200,
    onsetMin: 40,
    treatment: 'Recheck the surgical site and vital signs, oxygen, call the surgical team',
    source: SOURCE,
    branchPoints: [
      {
        atMin: 60,
        prompt: 'Pain is worse, heart rate is rising and the abdomen is tight.',
        effects: ALL_EFFECTS(
          'Call the surgical team with a structured report.',
          'Sit up, oxygen and pain care within scope; the cause remains.',
        ),
      },
      {
        atMin: 130,
        prompt: 'The patient is pale and sweating with a falling blood pressure.',
        effects: ALL_EFFECTS(
          'Call rapid response and the surgeon; return to the operating room is considered.',
          'With escalation done, ordered fluids and imaging proceed; the course reverses.',
        ),
      },
    ],
  },
  hypoglycemia: {
    label: 'Hypoglycemia',
    profile: 'diabetic',
    baseline: {
      heart_rate: 78,
      systolic_bp: 128,
      diastolic_bp: 76,
      respiratory_rate: 16,
      oxygen_saturation: 97,
      temperature: 36.9,
    },
    severe: {
      heart_rate: 108,
      systolic_bp: 136,
      diastolic_bp: 80,
      respiratory_rate: 20,
      oxygen_saturation: 96,
      temperature: 36.4,
    },
    baselineLabs: { glucose: 128 },
    severeLabs: { glucose: 38 },
    rise: 1 / 60,
    onsetMin: 10,
    treatment: 'Check glucose, give fast-acting carbohydrate or ordered dextrose per protocol',
    source: SOURCE,
    branchPoints: [
      {
        atMin: 25,
        prompt: 'The patient is sweaty, shaky and a little confused about an hour after insulin.',
        effects: ALL_EFFECTS(
          'Call the provider; the protocol can be started with an order.',
          'Check glucose and treat per protocol; recovery within minutes.',
        ),
      },
      {
        atMin: 45,
        prompt: 'The patient is drowsy and hard to wake.',
        effects: ALL_EFFECTS(
          'Call rapid response; intravenous dextrose can be given.',
          'With escalation done, intravenous dextrose is given; recovery is quick.',
        ),
      },
    ],
  },
}

export interface ActionAt {
  atMin: number
  action: LearnerAction
}

export interface TrajectoryParams {
  kind: TrajectoryKind
  seed: number
  durationMin: number
  stepMin: number
  /** The learner's actions at branch points (or any minute); the earliest drives the course. */
  actions?: ActionAt[]
}

export interface TrajectoryStep {
  minute: number
  severity: number
  vitals: Vitals
}

export interface TrajectoryLab {
  minute: number
  labs: Labs
}

export interface Trajectory {
  kind: TrajectoryKind
  label: string
  profile: PatientProfile
  seed: number
  steps: TrajectoryStep[]
  /** One lab draw every 60 minutes, starting at minute 0. */
  labs: TrajectoryLab[]
  branchPoints: BranchPoint[]
  treatment: string
  source: string
  /** The effect of the actions given, in words, in the order they took effect. */
  log: string[]
}

const clamp = (v: number, [lo, hi]: [number, number]): number => Math.min(hi, Math.max(lo, v))
const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d

function severityCourse(def: Definition, p: TrajectoryParams): { path: number[]; log: string[] } {
  const actions = [...(p.actions ?? [])].sort((a, b) => a.atMin - b.atMin)
  const log: string[] = []
  const path: number[] = []
  let severity = 0
  let rate = def.rise
  let escalated = false
  let recovering = false
  let next = 0
  for (let minute = 0; minute <= p.durationMin; minute += p.stepMin) {
    while (next < actions.length && actions[next]!.atMin <= minute) {
      const { atMin, action } = actions[next++]!
      const bp =
        def.branchPoints.find((b) => Math.abs(b.atMin - atMin) <= p.stepMin) ?? def.branchPoints[0]!
      log.push(`Minute ${atMin}: ${action}. ${bp.effects[action]}`)
      if (action === 'delay') rate *= 1.5
      if (action === 'escalate') escalated = true
      if (action === 'treat') {
        if (escalated) recovering = true
        else rate *= 0.7
      }
    }
    if (minute > def.onsetMin) {
      if (recovering) severity = Math.max(0, severity - p.stepMin / 90)
      else severity = Math.min(1, severity + rate * p.stepMin)
    }
    path.push(severity)
  }
  return { path, log }
}

function value(base: number, severe: number, severity: number): number {
  return base + (severe - base) * severity
}

/** The vitals and labs of a named course for a seed and the learner's actions. */
export function generateTrajectory(p: TrajectoryParams): Trajectory {
  const def = DEFINITIONS[p.kind]
  const { path, log } = severityCourse(def, p)
  const noise = rng(p.seed * 31 + p.durationMin)
  // A per-patient offset keeps two seeds apart without moving the story.
  const offset = rng(p.seed)
  const shift = Object.fromEntries(
    VITAL_KEYS.map((k) => [k, (offset() - 0.5) * 2 * NOISE[k] * 2]),
  ) as Vitals
  const steps: TrajectoryStep[] = path.map((severity, i) => {
    const vitals = {} as Vitals
    for (const k of VITAL_KEYS) {
      const raw =
        value(def.baseline[k], def.severe[k], severity) + shift[k] + (noise() - 0.5) * 2 * NOISE[k]
      vitals[k] = round(clamp(raw, VITAL_LIMITS[k]), DECIMALS[k])
    }
    // Diastolic never reaches systolic.
    vitals.diastolic_bp = Math.min(vitals.diastolic_bp, vitals.systolic_bp - 15)
    return { minute: i * p.stepMin, severity: round(severity, 3), vitals }
  })
  const labs: TrajectoryLab[] = []
  for (let minute = 0; minute <= p.durationMin; minute += 60) {
    const severity = path[Math.min(path.length - 1, Math.round(minute / p.stepMin))] ?? 0
    const draw: Labs = {}
    for (const key of Object.keys(def.baselineLabs) as LabKey[]) {
      const v = value(def.baselineLabs[key]!, def.severeLabs[key]!, severity)
      draw[key] = round(
        Math.max(0, v),
        key === 'troponin' || key === 'creatinine' || key === 'lactate' ? 2 : 1,
      )
    }
    labs.push({ minute, labs: draw })
  }
  return {
    kind: p.kind,
    label: def.label,
    profile: def.profile,
    seed: p.seed,
    steps,
    labs,
    branchPoints: def.branchPoints,
    treatment: def.treatment,
    source: def.source,
    log,
  }
}

/** The step nearest a minute. */
export const stepAt = (t: Trajectory, minute: number): TrajectoryStep =>
  t.steps.reduce(
    (best, s) => (Math.abs(s.minute - minute) < Math.abs(best.minute - minute) ? s : best),
    t.steps[0]!,
  )

/** An early warning score reading (keys of the neutral score) from a step. */
export function ewsReadingAt(t: Trajectory, minute: number): Record<string, number | string> {
  const { vitals, severity } = stepAt(t, minute)
  return {
    respiratory_rate: vitals.respiratory_rate,
    oxygen_saturation: vitals.oxygen_saturation,
    systolic_bp: vitals.systolic_bp,
    heart_rate: vitals.heart_rate,
    temperature: vitals.temperature,
    consciousness: severity >= 0.75 ? 'New confusion' : 'Alert',
  }
}

/** Data for the vitals_monitor figure over a window of minutes. */
export function toMonitorData(t: Trajectory, fromMin: number, toMin: number, patient: string) {
  const steps = t.steps.filter((s) => s.minute >= fromMin && s.minute <= toMin)
  const series = (key: VitalKey) => steps.map((s) => ({ x: s.minute, y: s.vitals[key] }))
  return {
    title: `${t.label}: monitor trend`,
    patient: `${patient} (simulated)`,
    xLabel: 'Minutes',
    parameters: [
      {
        key: 'heart_rate',
        label: 'Heart rate',
        unit: '/min',
        low: 50,
        high: 110,
        points: series('heart_rate'),
      },
      {
        key: 'blood_pressure',
        label: 'Blood pressure',
        unit: 'mmHg',
        low: 90,
        high: 160,
        points: steps.map((s) => ({
          x: s.minute,
          y: s.vitals.systolic_bp,
          y2: s.vitals.diastolic_bp,
        })),
      },
      {
        key: 'respiratory_rate',
        label: 'Respiratory rate',
        unit: '/min',
        low: 10,
        high: 24,
        points: series('respiratory_rate'),
      },
      {
        key: 'oxygen_saturation',
        label: 'Oxygen saturation',
        unit: '%',
        low: 92,
        points: series('oxygen_saturation'),
      },
      {
        key: 'temperature',
        label: 'Temperature',
        unit: 'C',
        low: 36,
        high: 38.3,
        points: series('temperature'),
      },
    ],
  }
}
