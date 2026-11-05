// Field lint rules (spec 0448 FR-1 `lintRules`, ADR-0074): format checks a toolkit names by id.
// A rule is app code that reads one inject type's fields and returns issues, which join the
// content issues the inject text stage sends back to the model in its repair round
// (generate/injects/consistency.ts). Packs cannot add rules; a toolkit lists the ids it relies on.

export interface FieldLintIssue {
  /** Field path as the model sees it ("fields.results[0].flag"). */
  path: string
  message: string
}

export interface FieldLintRule {
  id: string
  /** Inject types the rule reads. */
  injectTypes: readonly string[]
  check(fields: Record<string, unknown>): FieldLintIssue[]
}

const rules = new Map<string, FieldLintRule>()

/** Add a rule. The same object twice is a no-op; a different one under a taken id throws. */
export function registerFieldLintRule(rule: FieldLintRule): void {
  const existing = rules.get(rule.id)
  if (existing && existing !== rule)
    throw new Error(`Field lint rule "${rule.id}" is already registered`)
  rules.set(rule.id, rule)
}

export const fieldLintRuleIds = (): string[] => [...rules.keys()].sort()

/** Issues from every rule that reads this inject type; a rule that throws reports nothing. */
export function fieldLintIssues(type: string, fields: Record<string, unknown>): FieldLintIssue[] {
  const out: FieldLintIssue[] = []
  for (const rule of rules.values()) {
    if (!rule.injectTypes.includes(type)) continue
    try {
      out.push(...rule.check(fields))
    } catch {
      // A malformed field is the schema check's business, not the lint's.
    }
  }
  return out
}
