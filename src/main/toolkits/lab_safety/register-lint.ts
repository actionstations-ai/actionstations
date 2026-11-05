// The lab safety toolkit's content guardrails (spec 0466 FR-4, ADR-0135) as a field lint rule.
// The rule reads the injects of the lab products and the text types a lab exercise uses, so an
// inject that carries agent technique, quantities, strains or an agent the designer has not
// chosen from the reviewed list goes back to the model with the category named (the repair
// round), and a survivor shows as a warning on the inject. Importing this module registers it
// (lint-rules.ts lists it).
import { registerFieldLintRule, type FieldLintRule } from '../field-lint'
import { guardrailIssuesIn } from './guardrails'
import { LAB_GUARDRAIL_INJECT_TYPES } from './inject-types'
import { LAB_GUARDRAIL_RULE_ID } from './load-check'

const guardrails: FieldLintRule = {
  id: LAB_GUARDRAIL_RULE_ID,
  injectTypes: LAB_GUARDRAIL_INJECT_TYPES,
  check: (fields) =>
    guardrailIssuesIn(fields).map((i) => ({
      path: i.path,
      message: `Content guardrail (${i.category}): ${i.message}`,
    })),
}

registerFieldLintRule(guardrails)
