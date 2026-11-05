// The humanitarian toolkit's format rules (spec 0469 FR-7) as field lint rules. Importing this
// module registers them (lint-rules.ts lists it); a scenario runs them only when its toolkit
// lists the rule ids. A rule with nothing structured to check reports nothing.
import type { PipelineShipment } from '@shared/humanitarian/pipeline'
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkCampRates,
  checkClusterActivation,
  checkCoverage,
  checkPipelineStated,
  checkStockBalance,
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

function pipelineFigure(f: Record<string, unknown>):
  | {
      stockOnHand: number
      dailyConsumption: number
      shipments: PipelineShipment[]
      horizonDays: number
    }
  | undefined {
  if (!isRecord(f.figures)) return undefined
  for (const fig of Object.values(f.figures)) {
    if (!isRecord(fig) || fig.kind !== 'humanitarian_pipeline' || !isRecord(fig.data)) continue
    const d = fig.data
    if (typeof d.stockOnHand !== 'number' || typeof d.dailyConsumption !== 'number') continue
    const shipments = Array.isArray(d.shipments)
      ? d.shipments
          .filter(isRecord)
          .flatMap((s) =>
            typeof s.day === 'number' && typeof s.quantity === 'number'
              ? [{ day: s.day, quantity: s.quantity }]
              : [],
          )
      : []
    return {
      stockOnHand: d.stockOnHand,
      dailyConsumption: d.dailyConsumption,
      shipments,
      horizonDays: typeof d.horizonDays === 'number' ? d.horizonDays : 60,
    }
  }
  return undefined
}

const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : [])

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
  {
    id: 'humanitarian_pipeline_arithmetic',
    injectTypes: ['humanitarian_pipeline_dashboard', 'humanitarian_figure'],
    check(f) {
      const fig = pipelineFigure(f)
      return fig ? issues(checkPipelineStated(f, fig)) : []
    },
  },
  {
    id: 'humanitarian_stock_balance',
    injectTypes: ['humanitarian_warehouse_report'],
    check: (f) => issues(checkStockBalance(rows(f.stock))),
  },
  {
    id: 'humanitarian_coverage_arithmetic',
    injectTypes: ['humanitarian_distribution_report'],
    check: (f) => issues(checkCoverage(rows(f.sites))),
  },
  {
    id: 'humanitarian_camp_rates',
    injectTypes: ['humanitarian_camp_health_report'],
    check: (f) => issues(checkCampRates(f)),
  },
]

for (const r of rules) registerFieldLintRule(r)
