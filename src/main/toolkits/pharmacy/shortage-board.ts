// A shortage board built from FDA shortage records (spec 0463 FR-6): each row quotes the record
// (drug, presentation, NDC, status, related information with the estimated recovery) and carries
// the exercising organization's own fictional stock and usage, so days on hand follow the one
// model (on hand divided by usage). The records are history: the board says when they were
// retrieved and carries the endpoint's statement not to use them for medical decisions.
import { daysOnHand } from '../../../shared/pharmacy/arithmetic'
import type { ShortageRecord } from '../connectors/openfda-shortages'

export type BoardStatus = 'Available' | 'Limited' | 'Critical' | 'Out'

/** The fictional stock a scenario holds of one drug the FDA record names. */
export interface ScenarioStock {
  /** Text found in the record's generic name or presentation (case-insensitive). */
  match: string
  onHand: number
  usagePerDay: number
  /** Allocation tier or rule the team set; "Set by the team" when absent. */
  tier?: string
}

/** The board word for a record: unavailable and out-of-stock wording is Out, a resolved record Available, else Limited. */
export function boardStatus(r: ShortageRecord): BoardStatus {
  const text = `${r.availability ?? ''} ${r.status ?? ''}`.toLowerCase()
  if (/unavailable|not available|discontinued/.test(text)) return 'Out'
  if (/resolved|available$/.test(text.trim()) && !/limited/.test(text)) return 'Available'
  return 'Limited'
}

const clip = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
const round1 = (x: number): number => Math.round(x * 10) / 10

export interface BoardInput {
  records: readonly ShortageRecord[]
  stock: readonly ScenarioStock[]
  organization: string
  asOf: string
  /** Day the records were retrieved (YYYY-MM-DD). */
  retrievedOn: string
  /** The endpoint's `last_updated` date. */
  dataUpdated?: string
}

/** Fields for the pharmacy_shortage_board template; stock entries without a matching record are left off. */
export function shortageBoardFields(i: BoardInput): Record<string, unknown> {
  const rows = i.stock.flatMap((s) => {
    const key = s.match.toLowerCase()
    const r = i.records.find((x) =>
      `${x.generic_name ?? ''} ${x.presentation ?? ''}`.toLowerCase().includes(key),
    )
    if (!r || s.usagePerDay <= 0) return []
    const days = daysOnHand(s.onHand, s.usagePerDay)!
    return [
      {
        drug: r.generic_name ?? s.match,
        presentation: clip(r.presentation ?? 'Presentation not stated in the record', 160),
        ...(r.package_ndc ? { ndc: r.package_ndc } : {}),
        onHand: s.onHand,
        usagePerDay: s.usagePerDay,
        daysOnHand: round1(days),
        recovery: clip(
          r.related_info
            ? `FDA record, ${r.update_date ?? r.initial_posting_date ?? 'undated'}: ${r.related_info}`
            : 'No estimate in the FDA record',
          160,
        ),
        status: boardStatus(r),
        tier: s.tier ?? 'Set by the team',
      },
    ]
  })
  return {
    organization: i.organization,
    asOf: i.asOf,
    rows: rows.slice(0, 12),
    sourceNote: `Drug, presentation, NDC, status and recovery are quoted from FDA drug shortage records (openFDA, data updated ${i.dataUpdated ?? 'date not stated'}, retrieved ${i.retrievedOn}); on hand and usage are this exercise's fictional numbers. The FDA says not to use this data for medical decisions.`,
  }
}
