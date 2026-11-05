// Synthetic patients (spec 0452 FR-7, NFR-2): names, records, histories, medications and
// allergies that are invented from a seed and coherent with the story (a post-operative patient
// has had an operation, a patient on an anticoagulant has a reason for it). Nothing here is a
// real person: names come from short lists of common given names and surnames and combine into
// pairs no record is expected to match, and every record number carries "SIM". Deterministic.

export interface SyntheticPatient {
  simulated: true
  name: string
  mrn: string
  age: number
  sex: 'F' | 'M'
  weightKg: number
  /** Why the patient is on the unit. */
  admission: string
  history: string[]
  medications: { drug: string; dose: string; route: string; frequency: string }[]
  allergies: string[]
  codeStatus: 'Full code'
}

/** A small deterministic generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(r: () => number, list: readonly T[]): T =>
  list[Math.floor(r() * list.length) % list.length]!

const FEMALE = [
  'Elena',
  'Dana',
  'Priya',
  'Marta',
  'Grace',
  'Naomi',
  'Ruth',
  'Lucia',
  'Helen',
  'Aisha',
]
const MALE = [
  'Marcus',
  'Walter',
  'Raj',
  'Tomas',
  'Owen',
  'Samuel',
  'Victor',
  'Daniel',
  'Felix',
  'Henry',
]
const SURNAMES = [
  'Delgado',
  'Marsh',
  'Pruitt',
  'Whitfield',
  'Patel',
  'Okafor',
  'Lindqvist',
  'Brandt',
  'Mercer',
  'Castellano',
  'Hollis',
  'Tran',
]

export type PatientProfile = 'postoperative' | 'medical' | 'surgical_bleed' | 'cardiac' | 'diabetic'

interface Story {
  admission: (r: () => number) => string
  history: readonly string[]
  medications: SyntheticPatient['medications']
  ageRange: [number, number]
}

const STORIES: Record<PatientProfile, Story> = {
  postoperative: {
    admission: (r) =>
      pick(r, [
        'Day 2 after a bowel resection',
        'Day 1 after a total knee replacement',
        'Day 2 after an open abdominal surgery',
      ]),
    history: ['Hypertension', 'Type 2 diabetes', 'Former smoker'],
    medications: [
      { drug: 'Acetaminophen', dose: '650 mg', route: 'PO', frequency: 'every 6 hours as needed' },
      { drug: 'Heparin', dose: '5,000 units', route: 'subcutaneous', frequency: 'every 8 hours' },
      { drug: 'Piperacillin-tazobactam', dose: '4.5 g', route: 'IV', frequency: 'every 8 hours' },
    ],
    ageRange: [52, 82],
  },
  medical: {
    admission: (r) =>
      pick(r, [
        'Pneumonia, day 3',
        'Urinary tract infection, day 2',
        'Cellulitis of the leg, day 2',
      ]),
    history: ['Chronic kidney disease stage 3', 'Hypertension', 'COPD'],
    medications: [
      { drug: 'Ceftriaxone', dose: '1,000 mg', route: 'IV', frequency: 'every 24 hours' },
      { drug: 'Lisinopril', dose: '10 mg', route: 'PO', frequency: 'daily' },
    ],
    ageRange: [60, 88],
  },
  surgical_bleed: {
    admission: (r) =>
      pick(r, [
        'Day 1 after a hip replacement',
        'Day 1 after a hysterectomy',
        'Day 2 after a spinal fusion',
      ]),
    history: ['Atrial fibrillation', 'Hypertension'],
    medications: [
      { drug: 'Enoxaparin', dose: '40 mg', route: 'subcutaneous', frequency: 'daily' },
      { drug: 'Metoprolol', dose: '25 mg', route: 'PO', frequency: 'twice daily' },
    ],
    ageRange: [45, 80],
  },
  cardiac: {
    admission: (r) => pick(r, ['Chest pain under observation, day 1', 'Heart failure, day 2']),
    history: ['Hypertension', 'High cholesterol', 'Family history of heart disease'],
    medications: [
      { drug: 'Metoprolol', dose: '25 mg', route: 'PO', frequency: 'twice daily' },
      { drug: 'Atorvastatin', dose: '40 mg', route: 'PO', frequency: 'nightly' },
      { drug: 'Furosemide', dose: '40 mg', route: 'PO', frequency: 'daily' },
    ],
    ageRange: [55, 85],
  },
  diabetic: {
    admission: (r) => pick(r, ['Foot infection, day 2', 'Poorly controlled diabetes, day 1']),
    history: ['Type 2 diabetes', 'Diabetic neuropathy'],
    medications: [
      { drug: 'Insulin', dose: '10 units', route: 'subcutaneous', frequency: 'before meals' },
      { drug: 'Vancomycin', dose: '1,250 mg', route: 'IV', frequency: 'every 12 hours' },
    ],
    ageRange: [40, 78],
  },
}

const ALLERGY_OPTIONS = [
  'No known allergies',
  'Penicillin (rash)',
  'Sulfa drugs (hives)',
  'Latex (rash)',
  'Codeine (nausea)',
]

/** A coherent synthetic patient for a profile; the same seed gives the same patient. */
export function generatePatient(seed: number, profile: PatientProfile): SyntheticPatient {
  const r = rng(seed)
  const story = STORIES[profile]
  const sex = r() < 0.5 ? 'F' : 'M'
  const [lo, hi] = story.ageRange
  const age = lo + Math.floor(r() * (hi - lo + 1))
  const allergies = [pick(r, ALLERGY_OPTIONS)]
  // A patient allergic to penicillin is not on a penicillin-class antibiotic: swap it.
  const medications = story.medications.map((m) =>
    allergies[0]!.startsWith('Penicillin') && m.drug === 'Piperacillin-tazobactam'
      ? { drug: 'Cefazolin', dose: '2,000 mg', route: 'IV', frequency: 'every 8 hours' }
      : m,
  )
  const picked = story.history.filter(() => r() < 0.7)
  return {
    simulated: true,
    name: `${pick(r, sex === 'F' ? FEMALE : MALE)} ${pick(r, SURNAMES)}`,
    mrn: `SIM-${String(Math.floor(r() * 900000) + 100000)}`,
    age,
    sex,
    weightKg: Math.round((sex === 'F' ? 55 : 68) + r() * 35),
    admission: story.admission(r),
    history: picked.length ? picked : [story.history[0]!],
    medications,
    allergies,
    codeStatus: 'Full code',
  }
}
