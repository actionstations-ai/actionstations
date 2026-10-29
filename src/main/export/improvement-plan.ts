// The Improvement Plan as a tracker workbook (#419, FR-11): one row per corrective action with
// the Appendix A columns plus status and objectives, and a Ratings sheet, so an organization
// can track the actions outside the app. Written with the plain-text workbook helper of the
// Excel MSEL (#420): no formulas, and model text that starts like one is neutralized there.
import { capabilityName } from '@shared/core-capabilities'
import {
  CAPABILITY_ELEMENT_LABELS,
  CAPABILITY_RATING_LABELS,
  improvementPlanRows,
  type Aar,
} from '@shared/schemas/aar'
import type { Scenario } from '@shared/schemas/scenario'
import { capabilityObjectives } from '../aar/markdown'
import type { ExportModel } from './model'
import { tableWorkbook, type ColumnSpec } from './xlsx'

export const PLAN_COLUMNS = [
  { key: 'capability', header: 'Core Capability', width: 26 },
  { key: 'issue', header: 'Issue/Area for Improvement', width: 40, wrap: true },
  { key: 'action', header: 'Corrective Action', width: 56, wrap: true },
  { key: 'element', header: 'Capability Element', width: 18 },
  { key: 'organization', header: 'Primary Responsible Organization', width: 32 },
  { key: 'poc', header: 'Organization POC', width: 24 },
  { key: 'startDate', header: 'Start Date', width: 12 },
  { key: 'dueDate', header: 'Completion Date', width: 14 },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'objectives', header: 'Objective(s)', width: 32, wrap: true },
] as const satisfies readonly ColumnSpec[]

export const RATING_COLUMNS = [
  { key: 'capability', header: 'Core Capability', width: 28 },
  { key: 'rating', header: 'Confirmed Rating', width: 30 },
  { key: 'proposed', header: 'Proposed Rating', width: 30 },
  { key: 'met', header: 'Met', width: 8 },
  { key: 'partial', header: 'Partial', width: 8 },
  { key: 'notMet', header: 'Not Met', width: 8 },
  { key: 'notObserved', header: 'Not Observed', width: 12 },
  { key: 'objectives', header: 'Objective(s)', width: 40, wrap: true },
] as const satisfies readonly ColumnSpec[]

const STATUS_LABELS = { open: 'Open', in_progress: 'In progress', done: 'Done' } as const

function objectiveNames(s: Scenario, ids: string[]): string {
  return ids
    .map((id) => {
      const o = s.objectives.find((x) => x.id === id)
      return o ? o.name || o.text : id
    })
    .join('; ')
}

function roleLabel(s: Scenario, roleId: string | undefined): string {
  if (!roleId) return ''
  const r = s.roles.find((x) => x.id === roleId)
  return r ? r.abbreviation || r.name : roleId
}

/** Appendix A rows in document order, the proposed role in brackets until an organization owns it. */
export function planRows(aar: Aar, s: Scenario): string[][] {
  return improvementPlanRows(aar).map(({ capability, finding, action }) => [
    capabilityName(capability),
    finding.title,
    action.action,
    CAPABILITY_ELEMENT_LABELS[action.element],
    action.ownerOrganization || (action.ownerRole ? `[${roleLabel(s, action.ownerRole)}]` : ''),
    action.poc,
    action.startDate ?? '',
    action.dueDate ?? '',
    STATUS_LABELS[action.status],
    objectiveNames(s, finding.objectiveRefs),
  ])
}

const ratingText = (r: keyof typeof CAPABILITY_RATING_LABELS | undefined, pending: string) =>
  r ? `${CAPABILITY_RATING_LABELS[r]} (${r})` : pending

export function ratingRows(aar: Aar, s: Scenario): string[][] {
  return aar.capabilities.map((c) => [
    capabilityName(c.capability),
    ratingText(c.rating, 'Rating pending'),
    ratingText(c.proposedRating, ''),
    String(c.observationCounts.met),
    String(c.observationCounts.partial),
    String(c.observationCounts.not_met),
    String(c.observationCounts.not_observed),
    objectiveNames(s, capabilityObjectives(s, c)),
  ])
}

/** The tracker workbook; a scenario without a draft gives sheets with headers only. */
export function improvementPlanWorkbook(model: ExportModel): Promise<Buffer> {
  const { aar, scenario } = model
  return tableWorkbook(
    [
      { name: 'Improvement Plan', columns: PLAN_COLUMNS, rows: aar ? planRows(aar, scenario) : [] },
      { name: 'Ratings', columns: RATING_COLUMNS, rows: aar ? ratingRows(aar, scenario) : [] },
    ],
    {
      creator: model.project.orgName || 'Action Stations',
      created: new Date(model.generatedAt),
    },
  )
}
