// The load-time half of the lab guardrails (ADR-0135): a toolkit that names the guardrail rule
// (or is the lab safety toolkit) is scanned, and refused when any text in it carries a denied
// category. Only the categories are reported, never the text.
import type { Toolkit } from '@shared/toolkits'
import { guardrailCategoriesIn, type GuardrailCategory } from './guardrails'

export const LAB_GUARDRAIL_RULE_ID = 'lab.guardrails'

/** The denied categories in a toolkit that carries the guardrail; empty for any other toolkit. */
export function toolkitGuardrailCategories(toolkit: Toolkit): GuardrailCategory[] {
  const guarded = toolkit.id === 'lab_safety' || toolkit.lintRules.includes(LAB_GUARDRAIL_RULE_ID)
  return guarded ? guardrailCategoriesIn(toolkit) : []
}
