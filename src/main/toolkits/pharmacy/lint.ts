// Format and consistency checks of the pharmacy toolkit (spec 0463 FR-4): NDC shape, Celsius and
// Fahrenheit pairs, days on hand, excursion statistics, queue status, concentrations stated in
// one unit, lot balances and the notice timing words and dates for a controlled substance loss.
// Pure functions over structured inputs; each returns problems and never throws. The rules that
// wrap them are in register-lint.ts. Exercise content, not clinical or legal guidance.

export const PHARMACY_LINT_RULES = [
  'pharmacy_ndc_format',
  'pharmacy_temperature_pair',
  'pharmacy_days_on_hand',
  'pharmacy_excursion_stats',
  'pharmacy_queue_status',
  'pharmacy_substitution_units',
  'pharmacy_dose_plausibility',
  'pharmacy_lot_balance',
  'pharmacy_notice_timing',
] as const
export type PharmacyLintRule = (typeof PHARMACY_LINT_RULES)[number]

export interface PharmacyProblem {
  rule: PharmacyLintRule
  message: string
}

const problem = (rule: PharmacyLintRule, message: string): PharmacyProblem => ({ rule, message })

// ---- NDC ---------------------------------------------------------------------------------

/** The hyphenated 10-digit shapes (4-4-2, 5-3-2, 5-4-1) and the 11-digit shape (5-4-2). */
const NDC_SHAPES = [
  /^\d{4}-\d{4}-\d{2}$/,
  /^\d{5}-\d{3}-\d{2}$/,
  /^\d{5}-\d{4}-\d{1}$/,
  /^\d{5}-\d{4}-\d{2}$/,
]

/** A problem with one NDC as written, or undefined when it has a valid shape. */
export function ndcProblem(ndc: string): string | undefined {
  const text = ndc.trim()
  if (!text) return undefined
  if (NDC_SHAPES.some((re) => re.test(text))) return undefined
  if (/^\d{10,11}$/.test(text))
    return `NDC "${text}" has no hyphens; write the segments (4-4-2, 5-3-2 or 5-4-1 for 10 digits, 5-4-2 for 11)`
  return `NDC "${text}" is not a valid shape (10 digits as 4-4-2, 5-3-2 or 5-4-1, or 11 digits as 5-4-2)`
}

/** Every NDC written after the letters NDC in free text. */
export function ndcMentions(text: string): string[] {
  return [...text.matchAll(/\bNDC:?\s*#?\s*([0-9][0-9-]{7,14})/gi)].map((m) =>
    m[1]!.replace(/-+$/, ''),
  )
}

export function checkNdcs(ndcs: readonly string[]): PharmacyProblem[] {
  return ndcs.flatMap((n) => {
    const p = ndcProblem(n)
    return p ? [problem('pharmacy_ndc_format', p)] : []
  })
}

// ---- temperatures --------------------------------------------------------------------------

export const cToF = (c: number): number => (c * 9) / 5 + 32

const NUM = String.raw`-?\d+(?:\.\d+)?`
const SEP = String.raw`\s*(?:to|–|—)\s*`
/** "2 to 8 °C (36 to 46 °F)" and "-20 °C (-4 °F)": a Celsius value or range followed by Fahrenheit. */
const PAIR = new RegExp(
  `(${NUM})(?:${SEP}(${NUM}))?\\s*(?:°\\s*|degrees\\s*)?C\\b[^0-9\\n]{0,14}?\\(?\\s*(${NUM})(?:${SEP}(${NUM}))?\\s*(?:°\\s*|degrees\\s*)?F\\b`,
  'gi',
)

/** Celsius and Fahrenheit written side by side in `text` must agree to within one degree. */
export function checkTemperaturePairs(text: string): PharmacyProblem[] {
  const out: PharmacyProblem[] = []
  for (const m of text.matchAll(PAIR)) {
    const c = [m[1], m[2]].filter((x): x is string => x !== undefined).map(Number)
    const f = [m[3], m[4]].filter((x): x is string => x !== undefined).map(Number)
    if (c.length !== f.length) {
      out.push(
        problem(
          'pharmacy_temperature_pair',
          `"${m[0].trim()}" gives a range in one scale and a single value in the other`,
        ),
      )
      continue
    }
    c.forEach((value, i) => {
      if (Math.abs(cToF(value) - f[i]!) > 1)
        out.push(
          problem(
            'pharmacy_temperature_pair',
            `${value} °C is ${Math.round(cToF(value))} °F, not ${f[i]} °F ("${m[0].trim()}")`,
          ),
        )
    })
  }
  return out
}

/** A range label such as "2 to 8 °C (36 to 46 °F)" must state the numeric range it sits beside. */
export function checkRangeLabel(label: string, lowC: number, highC: number): PharmacyProblem[] {
  const out = checkTemperaturePairs(label)
  const m = new RegExp(`(${NUM})${SEP}(${NUM})\\s*(?:°\\s*)?C\\b`, 'i').exec(label)
  if (m && (Number(m[1]) !== lowC || Number(m[2]) !== highC))
    out.push(
      problem(
        'pharmacy_temperature_pair',
        `The range label says ${m[1]} to ${m[2]} °C but the range fields are ${lowC} to ${highC} °C`,
      ),
    )
  return out
}

export interface TemperatureStats {
  lowC: number
  highC: number
  minC: number
  maxC: number
  minutesOutside: number
  readings?: { time?: string; tempC: number; state?: string }[]
}

const round1 = (x: number): number => Math.round(x * 10) / 10

/** Minimum, maximum, time outside the range and the readings must agree with each other. */
export function checkExcursionStats(s: TemperatureStats): PharmacyProblem[] {
  const out: PharmacyProblem[] = []
  const add = (m: string) => out.push(problem('pharmacy_excursion_stats', m))
  if (s.minC > s.maxC) add(`The minimum (${s.minC} °C) is above the maximum (${s.maxC} °C)`)
  const outside = s.minC < s.lowC || s.maxC > s.highC
  if (outside && s.minutesOutside <= 0)
    add(
      `Readings reach ${s.minC} to ${s.maxC} °C, outside ${s.lowC} to ${s.highC} °C, but the time outside the range is 0 minutes`,
    )
  if (!outside && s.minutesOutside > 0)
    add(
      `The readings stay within ${s.lowC} to ${s.highC} °C but the report states ${s.minutesOutside} minutes outside the range`,
    )
  const readings = s.readings ?? []
  if (readings.length) {
    const temps = readings.map((r) => r.tempC)
    if (round1(Math.min(...temps)) !== round1(s.minC))
      add(
        `The lowest reading listed is ${Math.min(...temps)} °C but the minimum states ${s.minC} °C`,
      )
    if (round1(Math.max(...temps)) !== round1(s.maxC))
      add(
        `The highest reading listed is ${Math.max(...temps)} °C but the maximum states ${s.maxC} °C`,
      )
    readings.forEach((r) => {
      if (!r.state) return
      const out1 = r.tempC < s.lowC || r.tempC > s.highC
      if (out1 && r.state === 'In range')
        add(`${r.time ?? 'A reading'} is ${r.tempC} °C, outside the range, but marked in range`)
      if (!out1 && r.state === 'Out of range')
        add(`${r.time ?? 'A reading'} is ${r.tempC} °C, inside the range, but marked out of range`)
    })
  }
  return out
}

// ---- shortage arithmetic -------------------------------------------------------------------

export interface DaysOnHandRow {
  drug: string
  onHand: number
  usagePerDay: number
  daysOnHand: number
}

/** Days on hand is on hand divided by usage per day, to one decimal. */
export function checkDaysOnHand(rows: readonly DaysOnHandRow[], label = 'row'): PharmacyProblem[] {
  const out: PharmacyProblem[] = []
  rows.forEach((r, i) => {
    if (r.usagePerDay <= 0) {
      out.push(
        problem(
          'pharmacy_days_on_hand',
          `${r.drug || `${label} ${i + 1}`} has no usage per day to divide by`,
        ),
      )
      return
    }
    const expected = r.onHand / r.usagePerDay
    if (Math.abs(expected - r.daysOnHand) > 0.1)
      out.push(
        problem(
          'pharmacy_days_on_hand',
          `${r.drug || `${label} ${i + 1}`}: ${r.onHand} on hand at ${r.usagePerDay} per day is ${round1(expected)} days, not ${r.daysOnHand}`,
        ),
      )
  })
  return out
}

export interface QueueRow {
  name: string
  oldestMinutes: number
  targetMinutes: number
  status: string
}

/** A queue is over target exactly when its oldest item is older than the target. */
export function checkQueueStatus(rows: readonly QueueRow[]): PharmacyProblem[] {
  return rows.flatMap((q) => {
    const over = q.oldestMinutes > q.targetMinutes
    if (over && q.status !== 'Over target')
      return [
        problem(
          'pharmacy_queue_status',
          `${q.name}: the oldest item is ${q.oldestMinutes} minutes old against a ${q.targetMinutes} minute target, so it is over target`,
        ),
      ]
    if (!over && q.status === 'Over target')
      return [
        problem(
          'pharmacy_queue_status',
          `${q.name}: the oldest item is ${q.oldestMinutes} minutes old, within the ${q.targetMinutes} minute target`,
        ),
      ]
    return []
  })
}

// ---- substitution --------------------------------------------------------------------------

/** The concentration unit in a text, normalized ("mEq/L", "mg/mL"), or undefined when none. */
export function concentrationUnit(text: string): string | undefined {
  const m = /\b(mcg|mg|g|units?|meq|mmol|%)\s*(?:\/|per)\s*(ml|l|container|bag|vial|dl)\b/i.exec(
    text,
  )
  if (!m) return undefined
  const num = m[1]!.toLowerCase()
  const unit = num === 'meq' ? 'mEq' : num === 'unit' ? 'units' : num
  const vol =
    m[2]!.toLowerCase() === 'ml' ? 'mL' : m[2]!.toLowerCase() === 'l' ? 'L' : m[2]!.toLowerCase()
  return `${unit}/${vol}`
}

/** The two sides of a concentration row must be written in the same unit. */
export function checkConcentrationUnits(from: string, to: string): PharmacyProblem[] {
  const a = concentrationUnit(from)
  const b = concentrationUnit(to)
  if (a && b && a !== b)
    return [
      problem(
        'pharmacy_substitution_units',
        `Concentrations are stated in ${a} and ${b}; state both in the same unit`,
      ),
    ]
  if ((a && !b && /\d/.test(to)) || (b && !a && /\d/.test(from)))
    return [
      problem(
        'pharmacy_substitution_units',
        `One concentration is written per volume (${a ?? b}) and the other is not; state both the same way`,
      ),
    ]
  return []
}

// ---- recall lots ---------------------------------------------------------------------------

export interface LotRow {
  lot: string
  received: number
  dispensed: number
  onHand: number
  returned: number
  quarantined?: number
}

/** For each lot: received = dispensed + on hand + returned, and quarantined is part of on hand. */
export function checkLotBalance(lots: readonly LotRow[]): PharmacyProblem[] {
  const out: PharmacyProblem[] = []
  for (const l of lots) {
    const sum = l.dispensed + l.onHand + l.returned
    if (sum !== l.received)
      out.push(
        problem(
          'pharmacy_lot_balance',
          `Lot ${l.lot}: dispensed ${l.dispensed} + on hand ${l.onHand} + returned ${l.returned} is ${sum}, not the ${l.received} received`,
        ),
      )
    if (l.quarantined !== undefined && l.quarantined > l.onHand)
      out.push(
        problem(
          'pharmacy_lot_balance',
          `Lot ${l.lot}: ${l.quarantined} quarantined is more than the ${l.onHand} on hand`,
        ),
      )
  }
  return out
}

// ---- controlled substance notice timing ---------------------------------------------------

const DAY_MS = 86_400_000
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const parseDay = (s: string): number => Date.parse(`${s}T00:00:00Z`)

/** The next weekday after `day` (weekends skipped; federal holidays are not known here). */
export function nextBusinessDay(day: string): string {
  let ms = parseDay(day) + DAY_MS
  while ([0, 6].includes(new Date(ms).getUTCDay())) ms += DAY_MS
  return isoDay(ms)
}

export const addCalendarDays = (day: string, days: number): string =>
  isoDay(parseDay(day) + days * DAY_MS)

/** The Field Division notice is due one business day after discovery and Form 106 45 days after. */
export function checkLossDates(i: {
  discoveredOn: string
  noticeDueBy: string
  form106DueBy: string
}): PharmacyProblem[] {
  const out: PharmacyProblem[] = []
  if (Number.isNaN(parseDay(i.discoveredOn))) return out
  const notice = nextBusinessDay(i.discoveredOn)
  if (i.noticeDueBy !== notice)
    out.push(
      problem(
        'pharmacy_notice_timing',
        `Discovered ${i.discoveredOn}: the Field Division notice is due ${notice} (one business day; check federal holidays), not ${i.noticeDueBy}`,
      ),
    )
  const form = addCalendarDays(i.discoveredOn, 45)
  if (i.form106DueBy !== form)
    out.push(
      problem(
        'pharmacy_notice_timing',
        `Discovered ${i.discoveredOn}: Form 106 is due within 45 days, ${form}, not ${i.form106DueBy}`,
      ),
    )
  return out
}

const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|\n+/)

/** Prose that pairs Form 106 with the one business day clock, or the Field Division notice with 45 days. */
export function checkNoticeWording(text: string): PharmacyProblem[] {
  const out: PharmacyProblem[] = []
  for (const s of sentences(text)) {
    if (
      /\b(?:form\s*)?106\b/i.test(s) &&
      /\b(?:one|1)\s+business\s+day|24\s+hours/i.test(s) &&
      !/45\s+days/i.test(s)
    )
      out.push(
        problem(
          'pharmacy_notice_timing',
          'Form 106 is filed electronically within 45 days of discovery; the one business day clock is the written notice to the DEA Field Division',
        ),
      )
    if (
      /field\s+division/i.test(s) &&
      /\b45\s+days/i.test(s) &&
      !/\b(?:one|1)\s+business\s+day/i.test(s)
    )
      out.push(
        problem(
          'pharmacy_notice_timing',
          'The notice to the DEA Field Division is due within one business day of discovery; 45 days is the Form 106 clock',
        ),
      )
  }
  return out
}
