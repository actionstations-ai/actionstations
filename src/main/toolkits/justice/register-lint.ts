// The justice guardrails (spec 0465 FR-7, ADR-0130) as field lint rules: they run on the injects
// of the types below, so an inject that slips into tactics, security detail, notoriety or
// negotiation technique goes back to the model with the phrase named, and appears as a warning on
// the inject. Importing this module registers them (lint-rules.ts lists it). Text that is not
// about law enforcement, corrections or courts is never read, so another domain's emails and
// press releases are left alone.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  guardrailHitsForFields,
  JUSTICE_NEGOTIATION_TYPES,
  JUSTICE_OWN_TYPES,
  JUSTICE_PUBLIC_TYPES,
  JUSTICE_SHARED_TYPES,
  type GuardrailCategoryId,
  type GuardrailScope,
} from './guardrails'

export const JUSTICE_LINT_RULES = [
  'justice_coordination_level',
  'justice_no_notoriety',
  'justice_negotiation_decision_level',
] as const

function ruleFor(
  id: (typeof JUSTICE_LINT_RULES)[number],
  injectTypes: readonly string[],
  scope: GuardrailScope,
  categories: (c: GuardrailCategoryId) => boolean,
): FieldLintRule {
  return {
    id,
    injectTypes,
    check: (fields) =>
      guardrailHitsForFields(fields, new Set<GuardrailScope>([scope]))
        .filter((h) => categories(h.category))
        .map((h): FieldLintIssue => ({ path: 'fields', message: h.message })),
  }
}

const coordination = ruleFor(
  'justice_coordination_level',
  [...JUSTICE_OWN_TYPES, ...JUSTICE_SHARED_TYPES],
  'all',
  () => true,
)
const notoriety = ruleFor(
  'justice_no_notoriety',
  JUSTICE_PUBLIC_TYPES,
  'public',
  (c) => c === 'notoriety',
)
const negotiation = ruleFor(
  'justice_negotiation_decision_level',
  JUSTICE_NEGOTIATION_TYPES,
  'negotiation',
  (c) => c === 'negotiation_technique',
)

for (const r of [coordination, notoriety, negotiation]) registerFieldLintRule(r)
