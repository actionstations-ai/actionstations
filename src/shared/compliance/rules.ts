// Framework mapping rules (#426, spec 0426 FR-11): which controls an MSEL row exercises. Pure
// data matching, no regex from pack data: keywords are plain words compared on word boundaries.
//
// A rule matches a row when every criterion it sets matches (purpose tag, inject type, threat
// family, regulation trigger, keyword); within one criterion any listed value matches. A rule
// that sets no criterion matches nothing.
import type { ThreatFamilyId } from '../domains/schema'
import type { Framework, MappingRule } from '../schemas/compliance'
import type { MselRow } from '../schemas/scenario'

export interface RuleContext {
  /** The scenario's threat family (ScenarioBrief.threatFamily or the profile default). */
  threatFamily?: ThreatFamilyId | undefined
}

/** Lowercase text with every character but letters, digits, "'" and "-" turned into spaces. */
export function normalizeWords(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .trim()} `
}

const hasKeyword = (words: string, keyword: string): boolean =>
  words.includes(` ${normalizeWords(keyword).trim()} `)

function triggerMatches(rule: MappingRule, row: MselRow): boolean {
  const fired = row.triggers ?? []
  return rule.triggers.some((t) => {
    if (t === '*:*') return fired.length > 0
    const [reg, trig] = t.split(':')
    return fired.some((f) => f.regulationId === reg && (trig === '*' || f.triggerId === trig))
  })
}

export function ruleMatches(rule: MappingRule, row: MselRow, ctx: RuleContext): boolean {
  const checks: boolean[] = []
  if (rule.purposeTags.length) checks.push(rule.purposeTags.includes(row.purposeTag))
  if (rule.injectTypes.length) checks.push(!!row.format && rule.injectTypes.includes(row.format))
  if (rule.threatFamilies.length)
    checks.push(!!ctx.threatFamily && rule.threatFamilies.includes(ctx.threatFamily))
  if (rule.triggers.length) checks.push(triggerMatches(rule, row))
  if (rule.keywords.length) {
    const words = normalizeWords(`${row.event} ${row.expectedAction}`)
    checks.push(rule.keywords.some((k) => hasKeyword(words, k)))
  }
  return checks.length > 0 && checks.every(Boolean)
}

/** Control refs ("<frameworkId>:<controlId>") the framework's rules suggest for a row. */
export function suggestControls(framework: Framework, row: MselRow, ctx: RuleContext): string[] {
  const out = new Set<string>()
  for (const rule of framework.rules)
    if (ruleMatches(rule, row, ctx)) for (const c of rule.controls) out.add(`${framework.id}:${c}`)
  return [...out]
}
