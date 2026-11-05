// The humanitarian toolkit's format rules (spec 0469 FR-7) as field lint rules. Importing this
// module registers them (lint-rules.ts lists it); a scenario runs them only when its toolkit
// lists the rule ids. A rule with nothing structured to check reports nothing.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkClusterActivation,
  checkFundingArithmetic,
  checkGapList,
  checkMovementDecision,
  checkSavingLivesTogether,
  checkSecurityGuardrail,
  type HumanitarianProblem,
} from './lint'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function strings(value: unknown, out: string[] = [], key = ''): string[] {
  if (key === 'figures') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) strings(v, out, k)
  return out
}

const issues = (ps: HumanitarianProblem[]): FieldLintIssue[] =>
  ps.map((p) => ({ path: 'fields', message: p.message }))

const COORDINATION_TYPES = [
  'sitrep',
  'email',
  'memo',
  'official_letter',
  'press_release',
  'humanitarian_flash_update',
  'humanitarian_cluster_minutes',
  'humanitarian_hct_record',
  'humanitarian_needs_response_summary',
  'humanitarian_security_alert',
] as const

const SECURITY_TYPES = [
  'humanitarian_security_incident_report',
  'humanitarian_security_risk_assessment',
  'humanitarian_movement_request',
  'humanitarian_security_alert',
  'humanitarian_cmt_log',
  'humanitarian_family_liaison_update',
  'holding_statement',
  'press_release',
  'email',
  'memo',
  'sitrep',
] as const

const rules: FieldLintRule[] = [
  {
    id: 'humanitarian_cluster_activation',
    injectTypes: COORDINATION_TYPES,
    check: (f) => issues(checkClusterActivation(strings(f).join('\n'))),
  },
  {
    id: 'humanitarian_slt_responsibility',
    injectTypes: [...COORDINATION_TYPES, ...SECURITY_TYPES],
    check: (f) => issues(checkSavingLivesTogether(strings(f).join('\n'))),
  },
  {
    id: 'humanitarian_security_guardrail',
    injectTypes: SECURITY_TYPES,
    check: (f) => issues(checkSecurityGuardrail(strings(f).join('\n'))),
  },
  {
    id: 'humanitarian_gap_list',
    injectTypes: ['humanitarian_gap_list'],
    check(f) {
      if (!Array.isArray(f.gaps)) return []
      const gaps = f.gaps.filter(isRecord).map((g) => ({
        id: typeof g.id === 'string' ? g.id : undefined,
        status: String(g.status ?? ''),
        owner: typeof g.owner === 'string' ? g.owner : undefined,
      }))
      return issues(checkGapList(gaps, typeof f.summary === 'string' ? f.summary : undefined))
    },
  },
  {
    id: 'humanitarian_funding_arithmetic',
    injectTypes: ['humanitarian_funding_status'],
    check: (f) => issues(checkFundingArithmetic(f)),
  },
  {
    id: 'humanitarian_movement_decision',
    injectTypes: ['humanitarian_movement_request'],
    check: (f) => issues(checkMovementDecision(f)),
  },
]

for (const r of rules) registerFieldLintRule(r)
