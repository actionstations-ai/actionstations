// Customer reach (spec 0461 FR-13): of the medical baseline customers on circuits that lost power,
// how many the team reached (attempts and contacts are entered by the facilitator, and only a
// confirmed contact counts as reached), and which critical facilities were notified. The target is
// the designer's; none is assumed. Circuits, customers and facilities are fictional exercise data.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { NOT_AVAILABLE, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const CustomerReachConfig = z.object({
  /** Share of medical baseline customers to reach (0 to 1); 0 means no target is set. */
  targetShare: z.number().min(0).max(1).default(0),
})
export type CustomerReachConfig = z.infer<typeof CustomerReachConfig>

export interface CustomerReachInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}
const norm = (s: unknown): string =>
  String(s ?? '')
    .trim()
    .toLowerCase()

export function computeCustomerReach(
  inputs: CustomerReachInputs,
  config: CustomerReachConfig,
): MetricOutput {
  const groups = inputs.events.filter((e) => e.kind === 'medical_baseline_group')
  const contacts = inputs.decisions.filter((d) => d.kind === 'wildfire_contact_medical_baseline')
  const rows = groups.map((g) => {
    const mine = contacts.filter((d) => norm(d.area) === norm(g.area))
    const customers = num(g.attrs.customers)
    const attempts = mine.reduce((a, d) => a + num(d.fields.attempts), 0)
    const reached = Math.min(
      customers,
      mine.reduce((a, d) => a + num(d.fields.contacts), 0),
    )
    return { circuit: g.area ?? g.id, customers, attempts, reached }
  })
  const total = rows.reduce((a, r) => a + r.customers, 0)
  const reached = rows.reduce((a, r) => a + r.reached, 0)
  const attempts = rows.reduce((a, r) => a + r.attempts, 0)
  const facilities = inputs.events.filter((e) => e.kind === 'critical_facility')
  const notified = inputs.decisions.filter((d) => d.kind === 'wildfire_notify_critical_facility')
  const facRows = facilities.map((f) => {
    const name = String(f.attrs.name ?? f.id)
    const hit = notified.find((d) => norm(d.fields.facility) === norm(name))
    return { name, circuit: f.area ?? '', at: hit?.time ?? '' }
  })
  const share = ratio(reached, total)
  const metTarget = config.targetShare > 0 && share !== null ? share >= config.targetShare : null
  return {
    metricId: 'wildfire_customer_reach',
    title: 'Medical baseline customers and critical facilities reached',
    config,
    inputs: [
      { label: 'Medical baseline customers', value: String(total) },
      { label: 'Critical facilities', value: String(facilities.length) },
      {
        label: 'Target',
        value:
          config.targetShare > 0
            ? `${config.targetShare} of customers reached (set by the designer)`
            : 'None set',
      },
    ],
    summary: [
      { label: 'Contact attempts entered', value: String(attempts) },
      { label: 'Customers reached', value: `${reached} of ${total}` },
      { label: 'Share reached', value: ratioText(share) },
      ...(metTarget === null ? [] : [{ label: 'Target met', value: metTarget ? 'Yes' : 'No' }]),
      {
        label: 'Critical facilities notified',
        value: `${facRows.filter((f) => f.at).length} of ${facRows.length}`,
      },
    ],
    tables: [
      {
        title: 'Medical baseline customers by circuit',
        columns: ['Circuit', 'Customers', 'Attempts', 'Reached', 'Not yet reached'],
        rows: rows.map((r) => [
          r.circuit,
          String(r.customers),
          String(r.attempts),
          String(r.reached),
          String(r.customers - r.reached),
        ]),
      },
      {
        title: 'Critical facilities',
        columns: ['Facility', 'Circuit', 'Notified at'],
        rows: facRows.map((f) => [f.name, f.circuit, f.at || NOT_AVAILABLE]),
      },
    ],
    caveats: [
      'Attempts and contacts are entered by the facilitator; only a confirmed contact counts as reached.',
      "The target is the exercise designer's, not a standard. All circuits, customers and facilities are fictional.",
      ...(total === 0 ? ['The scenario listed no medical baseline customers.'] : []),
    ],
    data: {
      customers: total,
      reached,
      attempts,
      share,
      facilitiesNotified: facRows.filter((f) => f.at).length,
    },
  }
}

export const wildfireCustomerReach: Metric<CustomerReachConfig, CustomerReachInputs> = {
  id: 'wildfire_customer_reach',
  title: 'Medical baseline customers and critical facilities reached',
  configSchema: CustomerReachConfig,
  compute: computeCustomerReach,
}
