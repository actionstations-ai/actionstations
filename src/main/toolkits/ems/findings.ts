// Findings and injuries for a simulated patient that the chosen triage method sorts into the
// priority the scenario asked for (spec 0456 FR-9a). Patients are fictional and unnamed: age,
// sex and plain-word injuries only.
import type { Rng } from './rng'
import {
  PEDIATRIC_AGE_LIMIT,
  triage,
  type Findings,
  type TriageMethod,
  type TriagePriority,
} from './triage-methods'

type Target = Exclude<TriagePriority, 'Deceased'>

const INJURIES: Record<Target, string[]> = {
  Immediate: [
    'Chest trauma with trouble breathing',
    'Open femur fracture with heavy bleeding',
    'Head injury, drowsy',
    'Abdominal injury, pale and sweating',
    'Crush injury to the pelvis',
  ],
  Delayed: [
    'Forearm fracture, stable',
    'Pelvic pain, unable to walk',
    'Deep leg laceration, bleeding controlled',
    'Dislocated shoulder',
    'Rib injury, comfortable at rest',
  ],
  Minor: [
    'Scalp laceration, walking',
    'Bruised shoulder, walking',
    'Sprained wrist, walking',
    'Scrapes and a bruised knee, walking',
  ],
  Expectant: [
    'Massive crush injury, little response',
    'Severe head injury, unresponsive',
    'Extensive burns over most of the body',
  ],
}

const base = (age: number): Findings => ({
  ageYears: age,
  walks: false,
  breathing: true,
  respirationsPerMinute: age < PEDIATRIC_AGE_LIMIT ? 26 : 18,
  capillaryRefillSeconds: 1.5,
  radialPulse: true,
  obeysCommands: true,
  respiratoryDistress: false,
  hemorrhageControlled: true,
  lethalInjury: false,
})

type Breaker = (f: Findings, rng: Rng) => void

const startBreakers = (child: boolean): Breaker[] => [
  (f, r) => (f.respirationsPerMinute = child ? r.int(46, 56) : r.int(31, 42)),
  (f, r) => ((f.capillaryRefillSeconds = r.int(3, 5)), (f.radialPulse = false)),
  (f) => (f.obeysCommands = false),
]

const saltBreakers: Breaker[] = [
  (f) => (f.obeysCommands = false),
  (f) => (f.radialPulse = false),
  (f) => (f.respiratoryDistress = true),
  (f) => (f.hemorrhageControlled = false),
]

function findingsFor(target: Target, method: TriageMethod, age: number, rng: Rng): Findings {
  const f = base(age)
  const child = age < PEDIATRIC_AGE_LIMIT
  if (target === 'Minor') f.walks = true
  if (target === 'Delayed') f.respirationsPerMinute += rng.int(0, 6)
  if (target === 'Immediate') {
    const breakers = method === 'SALT' ? saltBreakers : startBreakers(child)
    rng.pick(breakers)(f, rng)
  }
  if (target === 'Expectant') {
    if (method === 'SALT') {
      f.lethalInjury = true
      f.obeysCommands = false
    } else f.breathing = false
  }
  return f
}

export interface SimulatedFindings {
  findings: Findings
  injuries: string
}

/** Findings the method turns into `target`; throws if the generator and method ever disagree. */
export function simulateFindings(
  target: Target,
  method: TriageMethod,
  age: number,
  rng: Rng,
): SimulatedFindings {
  const findings = findingsFor(target, method, age, rng)
  const got = triage(method, findings)
  if (got !== target) throw new Error(`Generated findings triage as ${got}, not ${target}`)
  return { findings, injuries: rng.pick(INJURIES[target]) }
}
