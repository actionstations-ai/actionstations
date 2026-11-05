// The governance toolkit's format rules (spec 0459 FR-4) as field lint rules: they run on the
// injects of the types below, so a draft with no exercise-aid line, a real company or ticker, an
// Item 1.05 report missing its required statements, an Item 8.01 report that claims materiality,
// or a decision with no owner or basis goes back to the model with the issue named. Importing
// this module registers them (lint-rules.ts lists it). A rule with nothing to check reports nothing.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkDecisionsDocumented,
  checkExerciseAid,
  checkFictionalCompany,
  checkItem105Content,
  checkItem801NoMateriality,
  type GovernanceProblem,
} from './lint'

export const GOVERNANCE_INJECT_TYPES = [
  'gov_board_briefing',
  'gov_materiality_worksheet',
  'gov_disclosure_draft',
  'gov_bia_table',
  'gov_ransom_decision_paper',
  'gov_legal_hold_notice',
  'gov_regulator_inquiry',
  'gov_insurer_notice',
  'gov_investor_questions',
  'gov_decision_log',
  'gov_succession_notice',
] as const

const toIssues = (problems: GovernanceProblem[]): FieldLintIssue[] =>
  problems.map((p) => ({ path: p.path, message: p.message }))

const rule = (
  id: string,
  injectTypes: readonly string[],
  check: (fields: Record<string, unknown>) => GovernanceProblem[],
): FieldLintRule => ({ id, injectTypes, check: (fields) => toIssues(check(fields)) })

const RULES: FieldLintRule[] = [
  rule('gov_exercise_aid', GOVERNANCE_INJECT_TYPES, checkExerciseAid),
  rule('gov_fictional_company', GOVERNANCE_INJECT_TYPES, checkFictionalCompany),
  rule('gov_item_105_content', ['gov_disclosure_draft'], checkItem105Content),
  rule('gov_item_801_no_materiality', ['gov_disclosure_draft'], checkItem801NoMateriality),
  rule(
    'gov_decisions_documented',
    ['gov_decision_log', 'gov_materiality_worksheet', 'gov_ransom_decision_paper'],
    checkDecisionsDocumented,
  ),
]

for (const r of RULES) registerFieldLintRule(r)
