// Format and consistency checks the outbreak-at-sea toolkit names (spec 0470 FR-4). Pure
// functions over structured inputs; each returns problems a generator or an evaluator can show
// and never throws. Counts are cumulative persons for the voyage; a percentage is cases divided
// by persons on board.

export const OUTBREAK_LINT_RULES = [
  'hosp_age_percent',
  'hosp_age_cumulative',
  'hosp_age_report_timing',
  'hosp_letter_no_medical_advice',
  'hosp_isolation_letter',
] as const

export interface HospLintProblem {
  rule: (typeof OUTBREAK_LINT_RULES)[number]
  message: string
}

export interface GroupCount {
  group: 'passengers' | 'crew'
  onBoard: number
  cases: number
  /** The percentage as printed, such as "2.5%". */
  printed: string
}

/** Percent with one decimal, rounded on the exact ratio. */
export const percentOf = (cases: number, onBoard: number): number =>
  onBoard > 0 ? Math.round((cases / onBoard) * 1000) / 10 : 0

/** The printed percentage must equal cases divided by persons on board, to one decimal. */
export function checkPercents(counts: readonly GroupCount[]): HospLintProblem[] {
  const out: HospLintProblem[] = []
  for (const c of counts) {
    const printed = Number.parseFloat(c.printed.replace('%', ''))
    if (Number.isNaN(printed)) {
      out.push({ rule: 'hosp_age_percent', message: `The ${c.group} percentage is not a number.` })
      continue
    }
    const exact = percentOf(c.cases, c.onBoard)
    if (Math.abs(printed - exact) > 0.05)
      out.push({
        rule: 'hosp_age_percent',
        message: `The ${c.group} percentage reads ${c.printed} but ${c.cases} of ${c.onBoard} is ${exact.toFixed(1)}%.`,
      })
    if (c.cases > c.onBoard)
      out.push({
        rule: 'hosp_age_percent',
        message: `More ${c.group} cases (${c.cases}) than ${c.group} on board (${c.onBoard}).`,
      })
  }
  return out
}

/** Cumulative counts never decrease from one report to the next. */
export function checkCumulative(
  now: { passengers: number; crew: number },
  before: { passengers: number; crew: number },
): HospLintProblem[] {
  const out: HospLintProblem[] = []
  for (const g of ['passengers', 'crew'] as const)
    if (now[g] < before[g])
      out.push({
        rule: 'hosp_age_cumulative',
        message: `The cumulative ${g} count fell from ${before[g]} to ${now[g]}; cumulative counts never go down.`,
      })
  return out
}

export type ReportType =
  | '24-hour report'
  | '4-hour update report'
  | 'Special report, 2 percent'
  | 'Special report, 3 percent'
  | 'Zero report'

/**
 * Report timing and level (42 CFR 71.21(c); VSP standards 4.2): the 24-hour report is sent 24 to
 * 36 hours before arrival, the 4-hour update at least 4 hours before, and a special report only
 * when passengers or crew have reached its level.
 */
export function checkReportTiming(input: {
  type: ReportType
  hoursBeforeArrival: number
  passengerPercent: number
  crewPercent: number
}): HospLintProblem[] {
  const out: HospLintProblem[] = []
  const h = input.hoursBeforeArrival
  const top = Math.max(input.passengerPercent, input.crewPercent)
  const bad = (message: string): void => void out.push({ rule: 'hosp_age_report_timing', message })
  if ((input.type === '24-hour report' || input.type === 'Zero report') && (h < 24 || h > 36))
    bad(`A 24-hour report is sent 24 to 36 hours before arrival, not ${h} hours.`)
  if (input.type === '4-hour update report' && h < 4)
    bad(`A 4-hour update is sent at least 4 hours before arrival, not ${h} hours.`)
  if (input.type === 'Special report, 2 percent' && top < 2)
    bad(
      `A 2 percent special report needs passengers or crew at 2% or more; the highest is ${top}%.`,
    )
  if (input.type === 'Special report, 3 percent' && top < 3)
    bad(
      `A 3 percent special report needs passengers or crew at 3% or more; the highest is ${top}%.`,
    )
  if (input.type === 'Zero report' && top > 0)
    bad(`A zero report states no cases, but the highest group is at ${top}%.`)
  return out
}

const MEDICAL_ADVICE =
  /\b(?:\d+\s?(?:mg|milligrams?|ml)|dose|dosage|antibiotics?|ibuprofen|acetaminophen|paracetamol|loperamide|imodium|anti-?diarrheals?|pepto|take (?:one|two|a) (?:tablet|pill|capsule))\b/i

/** A guest letter gives hygiene and isolation steps only: no drugs, doses or treatment. */
export function checkNoMedicalAdvice(texts: readonly string[]): HospLintProblem[] {
  return texts
    .filter((t) => MEDICAL_ADVICE.test(t))
    .map((t) => ({
      rule: 'hosp_letter_no_medical_advice' as const,
      message: `The letter gives medical advice ("${MEDICAL_ADVICE.exec(t)?.[0] ?? ''}"); give hygiene and isolation steps from the cited guidance only.`,
    }))
}

/** An isolation letter must state the 24 hours after symptoms end that the VSP standards set. */
export function checkIsolationLetter(texts: readonly string[]): HospLintProblem[] {
  const joined = texts.join(' ')
  if (/\b24[- ]hours?\b/i.test(joined) && /symptoms?/i.test(joined)) return []
  return [
    {
      rule: 'hosp_isolation_letter',
      message:
        'A cabin isolation letter must tell ill guests to stay in their cabins until 24 hours after their symptoms end.',
    },
  ]
}
