// Clinical systems metrics (spec 0451 FR-13, issue #882): time to downtime procedures, safe-care
// losses, critical result communication, reconciliation progress, duplicate records created and
// restore order against a clinician-defined priority list. Pure functions over plain inputs;
// every result shows its inputs, and a number that cannot be computed reads "n/a".
import { z } from 'zod'
import { NOT_AVAILABLE, minutesText, ms, type Metric } from './types'

const Config = z.object({}).passthrough()
type AnyConfig = z.infer<typeof Config>

const minutesBetween = (from: string, to: string): number => (ms(to) - ms(from)) / 60000
const pct = (n: number, d: number): string =>
  d === 0 ? NOT_AVAILABLE : `${Math.round((n / d) * 100)}%`

/** A comma, semicolon or ">" separated list written as text. */
export const listOf = (text: unknown): string[] =>
  String(text ?? '')
    .split(/[,>;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

// ---- time to downtime procedures -------------------------------------------------------------

export interface DowntimeProceduresInputs {
  declaredAt: string | null
  units: { unit: string; readyAt?: string }[]
}

export const timeToDowntimeProcedures: Metric<AnyConfig, DowntimeProceduresInputs> = {
  id: 'time_to_downtime_procedures',
  title: 'Declaration to all units on downtime procedures',
  configSchema: Config,
  compute(inputs, config) {
    const target = num(config.target, 60)
    const declared = inputs.declaredAt
    const rows = inputs.units.map((u) => ({
      unit: u.unit,
      minutes: declared && u.readyAt ? minutesBetween(declared, u.readyAt) : null,
    }))
    const known = rows.filter((r) => r.minutes !== null).map((r) => r.minutes as number)
    const all =
      declared && known.length === rows.length && rows.length > 0 ? Math.max(...known) : null
    const within = known.filter((m) => m <= target).length
    return {
      metricId: 'time_to_downtime_procedures',
      title: this.title,
      config,
      inputs: [
        { label: 'Downtime declared', value: declared ?? NOT_AVAILABLE },
        { label: 'Units', value: String(rows.length) },
        { label: 'Target', value: `${target} min` },
      ],
      summary: [
        { label: 'All units on procedures', value: minutesText(all) },
        { label: 'Units within target', value: `${within} of ${rows.length}` },
        { label: 'Units not yet on procedures', value: String(rows.length - known.length) },
      ],
      tables: [
        {
          title: 'Minutes from declaration, by unit',
          columns: ['Unit', 'Minutes', 'Within target'],
          rows: rows.map((r) => [
            r.unit,
            minutesText(r.minutes),
            r.minutes === null ? NOT_AVAILABLE : r.minutes <= target ? 'yes' : 'no',
          ]),
        },
      ],
      caveats: declared
        ? []
        : ['No downtime declaration was recorded, so no times can be computed.'],
      data: { allUnitsMinutes: all, withinTarget: within, units: rows },
    }
  },
}

// ---- safe-care losses ------------------------------------------------------------------------

export interface SafeCareInputs {
  records: { id: string; messageClass: string; outcome: 'ok' | 'lost' | 'delayed' | 'duplicated' }[]
}

export const safeCareLosses: Metric<AnyConfig, SafeCareInputs> = {
  id: 'safe_care_losses',
  title: 'Orders and results lost, delayed or duplicated',
  configSchema: Config,
  compute(inputs, config) {
    const count = (o: string) => inputs.records.filter((r) => r.outcome === o).length
    const classes = [...new Set(inputs.records.map((r) => r.messageClass))].sort()
    const total = inputs.records.length
    const bad = total - count('ok')
    return {
      metricId: 'safe_care_losses',
      title: this.title,
      config,
      inputs: [{ label: 'Orders and results tracked', value: String(total) }],
      summary: [
        { label: 'Lost', value: String(count('lost')) },
        { label: 'Delayed', value: String(count('delayed')) },
        { label: 'Duplicated', value: String(count('duplicated')) },
        { label: 'Affected share', value: pct(bad, total) },
      ],
      tables: [
        {
          title: 'By message class',
          columns: ['Class', 'Lost', 'Delayed', 'Duplicated', 'OK'],
          rows: classes.map((c) => {
            const mine = inputs.records.filter((r) => r.messageClass === c)
            const n = (o: string) => String(mine.filter((r) => r.outcome === o).length)
            return [c, n('lost'), n('delayed'), n('duplicated'), n('ok')]
          }),
        },
      ],
      caveats: total === 0 ? ['No orders or results were tracked.'] : [],
      data: {
        lost: count('lost'),
        delayed: count('delayed'),
        duplicated: count('duplicated'),
        total,
      },
    }
  },
}

// ---- critical result communication -----------------------------------------------------------

export interface CriticalResultInputs {
  results: { id: string; resultAt: string; communicatedAt?: string }[]
}

export const criticalResultCommunication: Metric<AnyConfig, CriticalResultInputs> = {
  id: 'critical_result_communication',
  title: 'Critical results communicated within target',
  configSchema: Config,
  compute(inputs, config) {
    const target = num(config.targetMinutes, 60)
    const rows = inputs.results.map((r) => ({
      id: r.id,
      minutes: r.communicatedAt ? minutesBetween(r.resultAt, r.communicatedAt) : null,
    }))
    const within = rows.filter((r) => r.minutes !== null && r.minutes <= target).length
    const pending = rows.filter((r) => r.minutes === null).length
    return {
      metricId: 'critical_result_communication',
      title: this.title,
      config,
      inputs: [
        { label: 'Critical results', value: String(rows.length) },
        { label: 'Target', value: `${target} min` },
      ],
      summary: [
        { label: 'Within target', value: `${within} of ${rows.length}` },
        { label: 'Share within target', value: pct(within, rows.length) },
        { label: 'Not communicated', value: String(pending) },
      ],
      tables: [
        {
          title: 'Minutes from result to communication',
          columns: ['Result', 'Minutes', 'Within target'],
          rows: rows.map((r) => [
            r.id,
            minutesText(r.minutes),
            r.minutes === null ? 'not communicated' : r.minutes <= target ? 'yes' : 'no',
          ]),
        },
      ],
      caveats: [],
      data: { within, total: rows.length, pending },
    }
  },
}

// ---- reconciliation --------------------------------------------------------------------------

export interface ReconciliationInputs {
  units: { unit: string; done: number; remaining: number }[]
  startedAt?: string
  completedAt?: string
}

export const reconciliationProgress: Metric<AnyConfig, ReconciliationInputs> = {
  id: 'reconciliation_progress',
  title: 'Reconciliation time and percent complete',
  configSchema: Config,
  compute(inputs, config) {
    const done = inputs.units.reduce((a, u) => a + u.done, 0)
    const remaining = inputs.units.reduce((a, u) => a + u.remaining, 0)
    const minutes =
      inputs.startedAt && inputs.completedAt
        ? minutesBetween(inputs.startedAt, inputs.completedAt)
        : null
    return {
      metricId: 'reconciliation_progress',
      title: this.title,
      config,
      inputs: [
        { label: 'Started', value: inputs.startedAt ?? NOT_AVAILABLE },
        { label: 'Closed', value: inputs.completedAt ?? 'still open' },
      ],
      summary: [
        { label: 'Percent complete', value: pct(done, done + remaining) },
        { label: 'Items done', value: String(done) },
        { label: 'Items remaining', value: String(remaining) },
        { label: 'Time to close', value: minutesText(minutes) },
      ],
      tables: [
        {
          title: 'By unit',
          columns: ['Unit', 'Done', 'Remaining', 'Percent complete'],
          rows: inputs.units.map((u) => [
            u.unit,
            String(u.done),
            String(u.remaining),
            pct(u.done, u.done + u.remaining),
          ]),
        },
      ],
      caveats: inputs.completedAt
        ? []
        : ['Reconciliation has not been closed; the time is not available.'],
      data: {
        done,
        remaining,
        percent: done + remaining === 0 ? null : done / (done + remaining),
        minutes,
      },
    }
  },
}

// ---- duplicate records -----------------------------------------------------------------------

export interface DuplicateRecordInputs {
  created: number
  expected?: number
}

export const duplicateRecordsCreated: Metric<AnyConfig, DuplicateRecordInputs> = {
  id: 'duplicate_records_created',
  title: 'Duplicate records created',
  configSchema: Config,
  compute(inputs, config) {
    return {
      metricId: 'duplicate_records_created',
      title: this.title,
      config,
      inputs: [
        {
          label: 'Expected from the downtime model',
          value: inputs.expected === undefined ? NOT_AVAILABLE : String(inputs.expected),
        },
      ],
      summary: [{ label: 'Duplicate records created', value: String(inputs.created) }],
      tables: [],
      caveats: [],
      data: { created: inputs.created, expected: inputs.expected ?? null },
    }
  },
}

// ---- restore order ---------------------------------------------------------------------------

export interface RestoreOrderInputs {
  order: string[]
  priority: string[]
}

/** A system name as a comparison key: lower case, words joined by underscores. */
export const systemKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** Spearman rank correlation of the order against the priority list (items in both). */
export function rankCorrelation(order: string[], priority: string[]): number | null {
  const common = priority.filter((p) => order.includes(p))
  const n = common.length
  if (n < 2) return null
  const rankInOrder = common.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const d2 = common.reduce((acc, item, i) => acc + (i - rankInOrder.indexOf(item)) ** 2, 0)
  return 1 - (6 * d2) / (n * (n * n - 1))
}

/** The share of item pairs the order puts in the same relative order as the priority list. */
export function pairAgreement(order: string[], priority: string[]): number | null {
  const common = priority.filter((p) => order.includes(p))
  let agree = 0
  let pairs = 0
  for (let i = 0; i < common.length; i++)
    for (let j = i + 1; j < common.length; j++) {
      pairs++
      if (order.indexOf(common[i]!) < order.indexOf(common[j]!)) agree++
    }
  return pairs === 0 ? null : agree / pairs
}

export const restoreOrderScore: Metric<AnyConfig, RestoreOrderInputs> = {
  id: 'restore_order_score',
  title: 'Restore order against the clinician priority list',
  configSchema: Config,
  compute(given, config) {
    // The priority list is the clinicians' judgment for the scenario: a comma-separated
    // `priority` in the toolkit's metric config when the inputs carry none.
    const inputs = {
      ...given,
      priority: given.priority.length ? given.priority : listOf(config.priority),
    }
    // "Lab interface", "lab-interface" and "lab_interface" name the same system.
    const order = inputs.order.map(systemKey)
    const priority = inputs.priority.map(systemKey)
    const rho = rankCorrelation(order, priority)
    const agree = pairAgreement(order, priority)
    const missing = inputs.priority.filter((_p, i) => !order.includes(priority[i]!))
    return {
      metricId: 'restore_order_score',
      title: this.title,
      config,
      inputs: [
        { label: 'Players chose', value: inputs.order.join(' > ') || NOT_AVAILABLE },
        { label: 'Clinician priority', value: inputs.priority.join(' > ') },
      ],
      summary: [
        {
          label: 'Rank correlation (1 = same order)',
          value: rho === null ? NOT_AVAILABLE : rho.toFixed(2),
        },
        {
          label: 'Pairs in the same order',
          value: agree === null ? NOT_AVAILABLE : `${Math.round(agree * 100)}%`,
        },
        { label: 'Priority items left out', value: String(missing.length) },
      ],
      tables: [],
      caveats: [
        "The priority list is the clinicians' judgment for this scenario, not a standard; read the score with the reasons players gave.",
        ...(missing.length ? [`Left out of the players' order: ${missing.join(', ')}.`] : []),
      ],
      data: { rho, agreement: agree, missing },
    }
  },
}
