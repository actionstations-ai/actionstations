// Lab flags (spec 0452 FR-4): whether the flag printed beside a result agrees with the result and
// the reference range printed with it. Pure.

export type LabFlag = '' | 'H' | 'L' | 'CRIT'

export interface ParsedRange {
  low?: number
  high?: number
}

/** The first number in a result or range text ("<0.05" gives 0.05, "1,250" gives 1250). */
export function firstNumber(text: string): number | undefined {
  const m = /-?\d[\d,]*(?:\.\d+)?|-?\.\d+/.exec(text.replace(/−/g, '-'))
  if (!m) return undefined
  const n = Number(m[0].replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** "0.5-2.0", "135 to 145", "<5", "up to 40", ">= 3.5" as bounds; undefined when not a range. */
export function parseRange(text: string): ParsedRange | undefined {
  const t = text.replace(/−/g, '-').replace(/,/g, '').trim()
  const between = /^(-?\d*\.?\d+)\s*(?:-|–|—|to)\s*(-?\d*\.?\d+)/.exec(t)
  if (between) {
    const low = Number(between[1])
    const high = Number(between[2])
    return low <= high ? { low, high } : undefined
  }
  const upper = /^(?:<=?|up to|max)\s*(-?\d*\.?\d+)/i.exec(t)
  if (upper) return { high: Number(upper[1]) }
  const lower = /^(?:>=?|min)\s*(-?\d*\.?\d+)/i.exec(t)
  if (lower) return { low: Number(lower[1]) }
  return undefined
}

/** H or L when the value is outside the range, '' when inside, undefined when it cannot be told. */
export function expectedDirection(value: string, range: string): 'H' | 'L' | '' | undefined {
  const n = firstNumber(value)
  const r = parseRange(range)
  if (n === undefined || !r) return undefined
  if (r.high !== undefined && n > r.high) return 'H'
  if (r.low !== undefined && n < r.low) return 'L'
  return ''
}

/** A problem with a flag, or undefined when it agrees. CRIT is allowed only outside the range. */
export function flagProblem(row: {
  test: string
  value: string
  range: string
  flag?: string
}): string | undefined {
  const expected = expectedDirection(row.value, row.range)
  if (expected === undefined) return undefined
  const flag = row.flag ?? ''
  if (flag === 'CRIT') {
    return expected === ''
      ? `${row.test} ${row.value} is inside the range ${row.range} but is flagged CRIT`
      : undefined
  }
  if (flag === expected) return undefined
  if (expected === '')
    return `${row.test} ${row.value} is inside the range ${row.range} but is flagged ${flag}`
  const side = expected === 'H' ? 'high' : 'low'
  return flag === ''
    ? `${row.test} ${row.value} is outside the range ${row.range} (${side}) but has no flag`
    : `${row.test} ${row.value} is ${side} for the range ${row.range} but is flagged ${flag}`
}
