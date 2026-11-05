// Format and consistency checks the logistics toolkit names (spec 0462 FR-4): lot codes that keep
// one shape, a recall letter that carries what 21 CFR 7.49 asks for, and recall counts that
// reconcile. Pure functions over structured inputs; each returns problems and never throws.

export const LOGISTICS_LINT_RULES = [
  'logistics_lot_code_format',
  'logistics_recall_letter_complete',
  'logistics_recall_counts_reconcile',
] as const

export interface LogisticsLintProblem {
  rule: (typeof LOGISTICS_LINT_RULES)[number]
  message: string
}

/** A lot code's shape: letters become A and digits 9, so MLW-261104-A is AAA-999999-A. */
export const lotShape = (code: string): string => code.replace(/[A-Za-z]/g, 'A').replace(/\d/g, '9')

const NOT_A_CODE = /^(?:unknown|n\/a|none|pending|tbd|-+)?$/i

/** Split a text such as "MLW-1, MLW-2" into trimmed codes, dropping placeholders. */
export function splitLots(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => !NOT_A_CODE.test(s))
}

/**
 * Within one record set the codes share one shape; a code whose shape differs from the most
 * common one is reported (a transformation step that changed the format without a mapping).
 */
export function checkLotCodeShapes(codes: readonly string[]): LogisticsLintProblem[] {
  const counts = new Map<string, number>()
  for (const c of codes) counts.set(lotShape(c), (counts.get(lotShape(c)) ?? 0) + 1)
  if (counts.size < 2) return []
  const [common] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!
  return codes
    .filter((c) => lotShape(c) !== common)
    .map((c) => ({
      rule: 'logistics_lot_code_format',
      message: `Lot code "${c}" has a different shape (${lotShape(c)}) from the others (${common}).`,
    }))
}

export interface RecallLetterInput {
  recallClass?: string
  urgent?: boolean
  lots: readonly string[]
  reason?: string
  hazard?: string
  instructions: readonly string[]
  contact?: string
  replyBy?: string
}

/** A direct-account recall letter: product and lots, reason, hazard, instructions, a way to reply. */
export function checkRecallLetter(l: RecallLetterInput): LogisticsLintProblem[] {
  const out: string[] = []
  if (l.lots.length === 0) out.push('The letter names no lot codes.')
  if (!l.reason?.trim()) out.push('The letter gives no reason for the recall.')
  if (!l.hazard?.trim()) out.push('The letter states no health hazard.')
  if (l.instructions.length === 0) out.push('The letter gives no instructions to the account.')
  if (!l.contact?.trim()) out.push('The letter gives no way to reply.')
  if (!l.replyBy?.trim()) out.push('The letter gives no reply deadline.')
  if (/^class (?:i|ii)$/i.test(l.recallClass ?? '') && !l.urgent)
    out.push('A Class I or Class II recall letter must be marked urgent (21 CFR 7.49).')
  return out.map((message) => ({ rule: 'logistics_recall_letter_complete', message }))
}

export interface RecallCounts {
  consignees?: { total: number; notified: number; responded: number; withProduct?: number }
  product?: { unit?: string; distributed: number; recovered: number; outstanding: number }
}

/** Distributed equals recovered plus outstanding; responded cannot exceed notified or notified total. */
export function checkRecallCounts(c: RecallCounts): LogisticsLintProblem[] {
  const out: string[] = []
  const p = c.product
  if (p && p.distributed !== p.recovered + p.outstanding)
    out.push(
      `Product distributed (${p.distributed}) is not recovered (${p.recovered}) plus outstanding (${p.outstanding}).`,
    )
  const k = c.consignees
  if (k) {
    if (k.notified > k.total)
      out.push(`Notified (${k.notified}) exceeds total accounts (${k.total}).`)
    if (k.responded > k.notified)
      out.push(`Responded (${k.responded}) exceeds notified (${k.notified}).`)
    if ((k.withProduct ?? 0) > k.responded)
      out.push(`Accounts with product (${k.withProduct}) exceeds responded (${k.responded}).`)
  }
  return out.map((message) => ({ rule: 'logistics_recall_counts_reconcile', message }))
}
