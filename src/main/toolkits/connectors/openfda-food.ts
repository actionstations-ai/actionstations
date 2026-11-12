// openFDA food enforcement replay connector (spec 0462 FR-9): past food recalls from the FDA
// Recall Enterprise System through openFDA (api.fda.gov), handed to a scenario as historical data
// with source and retrieval date, so a recall exercise can borrow real classes, reasons, depths
// and quantities. openFDA content is public domain (CC0) and asks for credit; use is rate
// limited per IP (240 requests a minute, 1,000 a day without a key), and this connector makes one
// request and never sends a key. The firm names and addresses in each record are left out: the
// exercise organization, suppliers and customers stay fictional.
//
// Everything user-controlled that reaches the query is checked against a fixed shape first (a
// class from a list, a number in range, a date), so no text is pasted into the query unchecked.
// The host is fixed in code. Nothing runs without the user's consent (case:plan-fetch then
// case:fetch).
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson } from './json'
import type { Connector, ConnectorQuery, ConnectorResult } from './registry'

const HOST = 'api.fda.gov'
const URL_BASE = `https://${HOST}/food/enforcement.json`
const CLASSES = ['Class I', 'Class II', 'Class III'] as const
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const BYTES_PER_RECORD = 1_800

const Record_ = z.looseObject({
  recall_number: z.string(),
  classification: z.string(),
  status: z.string().optional(),
  reason_for_recall: z.string().optional(),
  product_description: z.string().optional(),
  product_quantity: z.string().optional(),
  distribution_pattern: z.string().optional(),
  voluntary_mandated: z.string().optional(),
  report_date: z.string().optional(),
})
const Response = z.looseObject({
  meta: z.looseObject({
    last_updated: z.string().optional(),
    results: z.looseObject({ total: z.number().optional() }).optional(),
  }),
  results: z.array(Record_).default([]),
})

const compact = (iso: string): string => iso.slice(0, 10).replace(/-/g, '')

function classOf(q: ConnectorQuery): (typeof CLASSES)[number] | undefined {
  const c = q.options.classification
  if (c === undefined || c === '') return undefined
  const found = CLASSES.find((x) => x === c)
  if (!found)
    throw new AppError('VALIDATION', `Classification must be one of: ${CLASSES.join(', ')}`)
  return found
}

function limitOf(q: ConnectorQuery): number {
  const l = q.options.limit ?? DEFAULT_LIMIT
  if (typeof l !== 'number' || !Number.isInteger(l) || l < 1 || l > MAX_LIMIT)
    throw new AppError('VALIDATION', `Limit must be a whole number from 1 to ${MAX_LIMIT}`)
  return l
}

/** The query string: a report-date range and, when given, a class. Pure; used by estimate and fetch. */
export function enforcementQuery(q: ConnectorQuery): string {
  const start = Date.parse(q.range.start)
  const end = Date.parse(q.range.end)
  if (!(end >= start)) throw new AppError('VALIDATION', 'The period ends before it starts')
  const parts = [`report_date:[${compact(q.range.start)}+TO+${compact(q.range.end)}]`]
  const c = classOf(q)
  if (c) parts.push(`classification:"${c.replace(/ /g, '+')}"`)
  return `search=${parts.join('+AND+')}&limit=${limitOf(q)}`
}

export const openfdaFoodEnforcement: Connector = {
  id: 'openfda-food-enforcement',
  label: 'FDA food recalls and enforcement reports (openFDA)',
  source: 'FDA Recall Enterprise System through openFDA, api.fda.gov/food/enforcement',
  terms:
    'openFDA content is public domain (CC0); credit is requested ("Data provided by the U.S. Food and Drug Administration"). Use is rate limited per IP. Not for medical decisions; records are unvalidated.',
  hosts: [HOST],
  options: [
    {
      key: 'classification',
      label: 'Recall class',
      type: 'choice',
      help: 'Only recalls of this FDA class (Class I is the most serious); every class when left empty.',
      choices: CLASSES.map((c) => ({ value: c, label: c })),
      example: 'Class I',
    },
    {
      key: 'limit',
      label: 'Most reports',
      type: 'number',
      help: `How many enforcement reports to fetch, a whole number from 1 to ${MAX_LIMIT}.`,
      default: DEFAULT_LIMIT,
      example: DEFAULT_LIMIT,
    },
  ],
  estimate(q) {
    enforcementQuery(q)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'fda-food-enforcement',
          label: 'Food recall enforcement records (firm names left out)',
          kind: 'text',
          bytes: limitOf(q) * BYTES_PER_RECORD + 1_000,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const body = await getJson(ctx, `${URL_BASE}?${enforcementQuery(q)}`, Response, 'openFDA')
    const entries = body.results.map((r) => ({
      t: `${(r.report_date ?? compact(q.range.start)).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')}T00:00:00Z`,
      title: `${r.recall_number} ${r.classification}`,
      text: [
        `Recall ${r.recall_number}, ${r.classification}${r.status ? `, status ${r.status}` : ''}.`,
        r.voluntary_mandated ? `Initiated: ${r.voluntary_mandated}.` : '',
        r.product_description ? `Product: ${r.product_description}` : '',
        r.product_quantity ? `Quantity: ${r.product_quantity}.` : '',
        r.reason_for_recall ? `Reason: ${r.reason_for_recall}` : '',
        r.distribution_pattern ? `Distribution: ${r.distribution_pattern}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }))
    const updated = body.meta.last_updated ?? 'unknown'
    return {
      datasets: [
        {
          id: 'fda-food-enforcement',
          kind: 'text',
          label: 'Past food recalls (FDA enforcement reports)',
          file: 'fda-food-enforcement.json',
          range: q.range,
          area: q.area,
        },
      ],
      files: [{ name: 'fda-food-enforcement.json', data: JSON.stringify(entries) }],
      modified: `Reports dated ${q.range.start.slice(0, 10)} to ${q.range.end.slice(0, 10)}${classOf(q) ? `, ${classOf(q)} only` : ''}, first ${limitOf(q)} records; recalling firm names and addresses left out so the exercise organizations stay fictional.`,
      citation: `Data provided by the U.S. Food and Drug Administration (openFDA food enforcement, as of ${updated}).`,
    }
  },
}
