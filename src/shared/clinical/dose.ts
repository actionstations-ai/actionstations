// Dose plausibility (spec 0452 FR-4): a guard so the generator does not invent a dose a nurse
// would stop at once. It is not a drug reference: only a few common drugs are listed, with a
// generous single-dose ceiling and the routes that exist for them; anything else passes.
// Exercise content, not clinical guidance.

interface DrugLimit {
  /** Ceiling for one adult dose, in the unit. */
  max: number
  unit: 'mg' | 'units' | 'mEq'
  routes: string[]
}

const LIMITS: Record<string, DrugLimit> = {
  acetaminophen: { max: 1000, unit: 'mg', routes: ['po', 'iv', 'pr'] },
  ibuprofen: { max: 800, unit: 'mg', routes: ['po'] },
  ondansetron: { max: 16, unit: 'mg', routes: ['po', 'iv'] },
  metoprolol: { max: 200, unit: 'mg', routes: ['po', 'iv'] },
  lisinopril: { max: 80, unit: 'mg', routes: ['po'] },
  atorvastatin: { max: 80, unit: 'mg', routes: ['po'] },
  furosemide: { max: 200, unit: 'mg', routes: ['po', 'iv'] },
  heparin: { max: 10000, unit: 'units', routes: ['subcutaneous', 'sc', 'iv'] },
  vancomycin: { max: 3000, unit: 'mg', routes: ['iv', 'po'] },
  'piperacillin-tazobactam': { max: 4500, unit: 'mg', routes: ['iv'] },
  ceftriaxone: { max: 2000, unit: 'mg', routes: ['iv', 'im'] },
  morphine: { max: 15, unit: 'mg', routes: ['iv', 'im', 'po', 'subcutaneous', 'sc'] },
  hydromorphone: { max: 4, unit: 'mg', routes: ['iv', 'im', 'po', 'subcutaneous', 'sc'] },
  insulin: { max: 40, unit: 'units', routes: ['subcutaneous', 'sc', 'iv'] },
  'potassium chloride': { max: 40, unit: 'mEq', routes: ['po', 'iv'] },
  enoxaparin: { max: 150, unit: 'mg', routes: ['subcutaneous', 'sc'] },
  pantoprazole: { max: 80, unit: 'mg', routes: ['po', 'iv'] },
}

function inUnit(amount: number, from: string, unit: DrugLimit['unit']): number | undefined {
  const u = from.toLowerCase()
  if (unit === 'mg') {
    if (u === 'mg') return amount
    if (u === 'g') return amount * 1000
    if (u === 'mcg' || u === 'µg' || u === 'ug') return amount / 1000
    return undefined
  }
  if (unit === 'units') return /^(units?|u)$/.test(u) ? amount : undefined
  return u === 'meq' ? amount : undefined
}

/** A problem with one medication line, or undefined when it is plausible or not in the list. */
export function doseProblem(m: { drug: string; dose: string; route: string }): string | undefined {
  const name = m.drug.trim().toLowerCase()
  const key = Object.keys(LIMITS).find((k) => name === k || name.startsWith(`${k} `))
  if (!key) return undefined
  const limit = LIMITS[key]!
  const route = m.route.trim().toLowerCase()
  if (route && !limit.routes.includes(route))
    return `${m.drug} is not given by the route "${m.route}" in this exercise`
  const parsed = /(\d[\d,]*(?:\.\d+)?)\s*([a-zµ]+)/i.exec(m.dose)
  if (!parsed) return undefined
  const amount = inUnit(Number(parsed[1]!.replace(/,/g, '')), parsed[2]!, limit.unit)
  if (amount === undefined) return `${m.drug} is dosed in ${limit.unit}, not "${parsed[2]}"`
  if (amount > limit.max)
    return `${m.drug} ${m.dose} is above a plausible single adult dose (about ${limit.max} ${limit.unit}); correct it or flag it for review`
  return undefined
}
