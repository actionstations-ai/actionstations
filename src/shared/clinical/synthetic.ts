// Synthetic patient generator for the clinical systems toolkit (spec 0451 FR-4). Every patient is
// fictional by construction (family name TESTPATIENT, given names from a plant list), and age,
// diagnoses, medications, allergies and results agree with one another. Deterministic for a seed,
// so an exercise replays. Pure: no Node imports, no clock (the as-of date is an argument).
import { LAB_RANGES, flagFor, formatReference, labRange, type ResultFlag } from './reference'

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Medication {
  name: string
  dose: string
  route: string
  frequency: string
  /** Allergy class the drug belongs to, when it has one. */
  allergyClass?: string
}

export interface LabResult {
  labId: string
  test: string
  value: number
  text: string
  unit: string
  reference: string
  flag: ResultFlag
}

export interface Diagnosis {
  name: string
  minAge: number
  maxAge: number
  medications: Medication[]
  /** Lab ids pushed out of range by the condition: 'high' or 'low'. */
  labTendency: Record<string, 'high' | 'low'>
}

export const DIAGNOSES: readonly Diagnosis[] = [
  {
    name: 'Heart failure with reduced ejection fraction',
    minAge: 60,
    maxAge: 92,
    medications: [
      { name: 'Furosemide', dose: '40 mg', route: 'PO', frequency: 'daily' },
      { name: 'Metoprolol succinate', dose: '50 mg', route: 'PO', frequency: 'daily' },
      { name: 'Lisinopril', dose: '10 mg', route: 'PO', frequency: 'daily' },
    ],
    labTendency: { sodium: 'low', creatinine: 'high' },
  },
  {
    name: 'Community-acquired pneumonia',
    minAge: 30,
    maxAge: 90,
    medications: [
      { name: 'Ceftriaxone', dose: '1 g', route: 'IV', frequency: 'daily' },
      { name: 'Azithromycin', dose: '500 mg', route: 'PO', frequency: 'daily' },
      {
        name: 'Amoxicillin',
        dose: '875 mg',
        route: 'PO',
        frequency: 'twice daily',
        allergyClass: 'penicillin',
      },
    ],
    labTendency: { wbc: 'high' },
  },
  {
    name: 'Type 2 diabetes mellitus',
    minAge: 40,
    maxAge: 90,
    medications: [
      { name: 'Metformin', dose: '500 mg', route: 'PO', frequency: 'twice daily' },
      { name: 'Insulin glargine', dose: '20 units', route: 'SC', frequency: 'at bedtime' },
    ],
    labTendency: { glucose: 'high' },
  },
  {
    name: 'Chronic kidney disease stage 3',
    minAge: 55,
    maxAge: 92,
    medications: [
      { name: 'Amlodipine', dose: '5 mg', route: 'PO', frequency: 'daily' },
      { name: 'Sodium bicarbonate', dose: '650 mg', route: 'PO', frequency: 'twice daily' },
    ],
    labTendency: { creatinine: 'high', potassium: 'high', hemoglobin: 'low' },
  },
  {
    name: 'COPD exacerbation',
    minAge: 50,
    maxAge: 90,
    medications: [
      { name: 'Prednisone', dose: '40 mg', route: 'PO', frequency: 'daily' },
      { name: 'Albuterol', dose: '2.5 mg', route: 'INH', frequency: 'every 4 hours' },
      { name: 'Doxycycline', dose: '100 mg', route: 'PO', frequency: 'twice daily' },
    ],
    labTendency: { wbc: 'high', bicarbonate: 'high' },
  },
  {
    name: 'Atrial fibrillation',
    minAge: 55,
    maxAge: 95,
    medications: [
      { name: 'Apixaban', dose: '5 mg', route: 'PO', frequency: 'twice daily' },
      { name: 'Diltiazem', dose: '120 mg', route: 'PO', frequency: 'daily' },
    ],
    labTendency: {},
  },
  {
    name: 'Hip fracture, post-operative day 1',
    minAge: 65,
    maxAge: 95,
    medications: [
      { name: 'Enoxaparin', dose: '40 mg', route: 'SC', frequency: 'daily' },
      { name: 'Acetaminophen', dose: '650 mg', route: 'PO', frequency: 'every 6 hours' },
      {
        name: 'Cefazolin',
        dose: '2 g',
        route: 'IV',
        frequency: 'every 8 hours',
        allergyClass: 'penicillin',
      },
    ],
    labTendency: { hemoglobin: 'low' },
  },
]

const GIVEN = [
  'Alder',
  'Birch',
  'Cedar',
  'Dogwood',
  'Elm',
  'Fir',
  'Hazel',
  'Juniper',
  'Larch',
  'Maple',
  'Nettle',
  'Oak',
  'Pine',
  'Quince',
  'Rowan',
  'Spruce',
  'Tamarack',
  'Willow',
  'Yarrow',
  'Zinnia',
]
export const SYNTHETIC_FAMILY_NAME = 'TESTPATIENT'
const ALLERGIES = ['penicillin', 'sulfa drugs', 'latex', 'iodinated contrast', 'no known allergies']

export interface SyntheticPatient {
  index: number
  family: string
  given: string
  sex: 'M' | 'F'
  /** ISO date, YYYY-MM-DD. */
  birthDate: string
  ageYears: number
  mrn: string
  diagnoses: string[]
  medications: Medication[]
  allergies: string[]
  results: LabResult[]
}

export interface PatientOptions {
  /** As-of date (YYYY-MM-DD) ages are computed against. */
  asOf: string
  /** Record number format: a prefix and a digit count (default none, 8). */
  mrn?: { prefix?: string; digits?: number }
}

const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!
const between = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1))

function ageOn(birthDate: string, asOf: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [ay, am, ad] = asOf.split('-').map(Number) as [number, number, number]
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0)
}

function birthDateFor(rng: () => number, age: number, asOf: string): string {
  const [ay] = asOf.split('-').map(Number) as [number]
  const year = ay - age - 1
  const month = between(rng, 1, 12)
  const day = between(rng, 1, 28)
  // The exact age is age or age + 1 depending on whether the birthday has passed; ageYears is
  // always recomputed from the date, so the two agree.
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function makeResults(rng: () => number, dx: Diagnosis[]): LabResult[] {
  const tendency: Record<string, 'high' | 'low'> = {}
  for (const d of dx) Object.assign(tendency, d.labTendency)
  return LAB_RANGES.filter((r) =>
    ['sodium', 'potassium', 'creatinine', 'glucose', 'hemoglobin', 'wbc'].includes(r.id),
  ).map((r) => {
    const span = r.high - r.low
    const t = tendency[r.id]
    const raw =
      t === 'high'
        ? r.high + span * (0.1 + rng() * 0.5)
        : t === 'low'
          ? r.low - span * (0.1 + rng() * 0.4)
          : r.low + span * (0.15 + rng() * 0.7)
    const value = Number(raw.toFixed(r.decimals))
    return {
      labId: r.id,
      test: r.name,
      value,
      text: value.toFixed(r.decimals),
      unit: r.unit,
      reference: formatReference(r),
      flag: flagFor(r, value),
    }
  })
}

/** One synthetic patient; `index` and `seed` fix every value. */
export function generatePatient(
  seed: number,
  index: number,
  opts: PatientOptions,
): SyntheticPatient {
  const rng = makeRng(seed * 7919 + index * 104729)
  const primary = pick(rng, DIAGNOSES)
  const secondary =
    rng() < 0.5
      ? pick(
          rng,
          DIAGNOSES.filter((d) => d !== primary),
        )
      : undefined
  const dx = secondary ? [primary, secondary] : [primary]
  const ageMin = Math.max(...dx.map((d) => d.minAge))
  const ageMax = Math.min(...dx.map((d) => d.maxAge))
  const age =
    ageMin <= ageMax ? between(rng, ageMin, ageMax) : between(rng, primary.minAge, primary.maxAge)
  const allergy = pick(rng, ALLERGIES)
  const allergies = allergy === 'no known allergies' ? [] : [allergy]
  const meds = dx
    .flatMap((d) => d.medications)
    .filter((m) => !(m.allergyClass && allergies.includes(m.allergyClass)))
  const chosen = meds.filter((_, i) => i < 3 || rng() < 0.4)
  const digits = opts.mrn?.digits ?? 8
  const mrnNumber = String(
    10 ** (digits - 3) + Math.floor(rng() * 9 * 10 ** (digits - 3)),
  ).padStart(digits, '0')
  const given = GIVEN[index % GIVEN.length]!
  const birthDate = birthDateFor(rng, age, opts.asOf)
  return {
    index,
    family: SYNTHETIC_FAMILY_NAME,
    given: index >= GIVEN.length ? `${given}-${Math.floor(index / GIVEN.length) + 1}` : given,
    sex: rng() < 0.5 ? 'M' : 'F',
    birthDate,
    ageYears: ageOn(birthDate, opts.asOf),
    mrn: `${opts.mrn?.prefix ?? ''}${mrnNumber}`,
    diagnoses: dx.map((d) => d.name),
    medications: chosen,
    allergies,
    results: makeResults(rng, dx),
  }
}

export function generatePatients(
  seed: number,
  count: number,
  opts: PatientOptions,
): SyntheticPatient[] {
  return Array.from({ length: count }, (_, i) => generatePatient(seed, i, opts))
}

/** Problems that would make a patient look inconsistent; empty means consistent. */
export function patientIssues(p: SyntheticPatient, asOf: string): string[] {
  const issues: string[] = []
  if (ageOn(p.birthDate, asOf) !== p.ageYears) issues.push('age does not match birth date')
  for (const m of p.medications)
    if (m.allergyClass && p.allergies.includes(m.allergyClass))
      issues.push(`${m.name} conflicts with the ${m.allergyClass} allergy`)
  for (const r of p.results)
    if (flagFor(labRange(r.labId), r.value) !== r.flag)
      issues.push(`${r.test} flag disagrees with its value`)
  if (p.family !== SYNTHETIC_FAMILY_NAME) issues.push('family name is not the synthetic marker')
  return issues
}
