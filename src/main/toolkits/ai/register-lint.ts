// The AI incidents field lint rules (spec 0467 FR-4), registered with the field lint registry so
// they run on the injects of the types the toolkit adds. Importing this module registers them;
// lint-rules.ts lists it.
import { registerFieldLintRule, type FieldLintRule } from '../field-lint'
import { lintClockStated, lintSeriousIncidentFields, lintTestIdentifiers } from './lint'

export const AI_LINT_RULES = [
  'ai.serious_incident_fields',
  'ai.clock_stated',
  'ai.test_identifiers',
] as const

const rules: FieldLintRule[] = [
  {
    id: 'ai.serious_incident_fields',
    injectTypes: ['serious_incident_notice'],
    check: lintSeriousIncidentFields,
  },
  { id: 'ai.clock_stated', injectTypes: ['serious_incident_notice'], check: lintClockStated },
  {
    id: 'ai.test_identifiers',
    injectTypes: ['payment_recall_request'],
    check: lintTestIdentifiers,
  },
]

for (const r of rules) registerFieldLintRule(r)
