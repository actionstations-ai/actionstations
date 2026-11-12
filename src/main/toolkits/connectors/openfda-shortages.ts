// openFDA drug shortage replay (spec 0463 FR-6, ADR-0121): the FDA's shortage records for one
// drug name or therapeutic class, from api.fda.gov, handed to a scenario as dated history. The
// records are shown as the FDA published them (status, availability, related information with
// the estimated recovery, contact) with the retrieval date and the endpoint's own statement not
// to use them for medical decisions. The endpoint holds the current state only, so a fetch is a
// dated snapshot, never a past day's state of supply. Real manufacturer names that appear in a
// record are quotes of that record; the exercising organization stays fictional.
//
// The host is fixed in code and only the search term (checked against a fixed shape) leaves the
// machine. No key is used. Nothing runs without the user's consent (case:plan-fetch then
// case:fetch).
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

const HOST = 'api.fda.gov'
const BASE = `https://${HOST}/drug/shortages.json`
const PAGE = 100
/** Most pages one fetch reads (500 records), so a broad class cannot run past the scenario limit. */
const MAX_PAGES = 5
const TERM = /^[A-Za-z0-9][A-Za-z0-9 ,()'./-]{1,79}$/

export const ShortageRecord = z.looseObject({
  generic_name: z.string().optional(),
  package_ndc: z.string().optional(),
  presentation: z.string().optional(),
  company_name: z.string().optional(),
  status: z.string().optional(),
  availability: z.string().optional(),
  update_type: z.string().optional(),
  initial_posting_date: z.string().optional(),
  update_date: z.string().optional(),
  discontinued_date: z.string().optional(),
  related_info: z.string().optional(),
  contact_info: z.string().optional(),
  dosage_form: z.string().optional(),
  therapeutic_category: z.array(z.string()).optional(),
  openfda: z
    .looseObject({
      brand_name: z.array(z.string()).optional(),
      manufacturer_name: z.array(z.string()).optional(),
      route: z.array(z.string()).optional(),
    })
    .optional(),
})
export type ShortageRecord = z.infer<typeof ShortageRecord>

const Page = z.looseObject({
  meta: z.looseObject({
    disclaimer: z.string().optional(),
    last_updated: z.string().optional(),
    results: z.looseObject({ total: z.number().int().nonnegative() }),
  }),
  results: z.array(ShortageRecord).default([]),
})

export type ShortageSearch = { field: 'generic_name' | 'therapeutic_category'; term: string }

/** What to search: a drug name (option "drug") or a therapeutic class (option "class"), one of the two. */
export function shortageSearch(q: ConnectorQuery): ShortageSearch {
  const drug = q.options.drug
  const cls = q.options.class
  if ((drug === undefined || drug === '') === (cls === undefined || cls === ''))
    throw new AppError(
      'VALIDATION',
      'Give either a drug name (option "drug") or a class (option "class")',
    )
  const term = String(drug ?? cls).trim()
  if (!TERM.test(term))
    throw new AppError(
      'VALIDATION',
      'The search term may use letters, digits, spaces and basic punctuation only',
    )
  return { field: drug ? 'generic_name' : 'therapeutic_category', term }
}

/** The query string for one page: the term as a quoted phrase, spaces as plus signs. */
export function shortageUrl(s: ShortageSearch, skip: number): string {
  const phrase = s.term.split(/\s+/).map(encodeURIComponent).join('+')
  return `${BASE}?search=${s.field}:%22${phrase}%22&limit=${PAGE}&skip=${skip}`
}

const textOf = (data: Uint8Array): string => new TextDecoder().decode(data)

/** MM/DD/YYYY as the endpoint writes it, to an ISO day-start time. */
export function fdaDate(s: string | undefined): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? '')
  return m ? `${m[3]}-${m[1]}-${m[2]}T00:00:00Z` : undefined
}

async function getPage(
  ctx: FetchContext,
  s: ShortageSearch,
  skip: number,
): Promise<z.infer<typeof Page> | undefined> {
  const r = await ctx.get(shortageUrl(s, skip))
  if (r.status === 404) return undefined // openFDA answers "No matches found" with 404
  if (r.status !== 200) throw new AppError('INTERNAL', `api.fda.gov answered ${r.status}`)
  let json: unknown
  try {
    json = JSON.parse(textOf(r.data))
  } catch {
    throw new AppError('INTERNAL', 'api.fda.gov sent a response that is not JSON')
  }
  const parsed = Page.safeParse(json)
  if (!parsed.success) throw new AppError('INTERNAL', 'Unexpected response from api.fda.gov')
  return parsed.data
}

const line = (label: string, value: string | undefined): string[] =>
  value ? [`${label}: ${value}`] : []

/** One record as the readable text an inject can quote, with the dates the FDA gave. */
export function recordText(r: ShortageRecord): string {
  return [
    ...line('Presentation', r.presentation),
    ...line('Package NDC', r.package_ndc),
    ...line('Company', r.company_name ?? r.openfda?.manufacturer_name?.[0]),
    ...line('FDA status', r.status),
    ...line('Availability', r.availability),
    ...line('Related information', r.related_info),
    ...line('Contact', r.contact_info),
    ...line('Initial posting', r.initial_posting_date),
    ...line('Last update', r.update_date),
    ...line('Discontinued', r.discontinued_date),
  ].join('\n')
}

export const openfdaShortages: Connector = {
  id: 'openfda-shortages',
  label: 'FDA drug shortage records (openFDA)',
  source: 'FDA drug shortages database through openFDA, api.fda.gov/drug/shortages',
  terms:
    'openFDA data (https://open.fda.gov/terms/). The endpoint states: do not rely on openFDA to make decisions regarding medical care. It holds the current state of each record, so a fetch is a dated snapshot.',
  hosts: [HOST],
  options: [
    {
      key: 'drug',
      label: 'Drug name',
      type: 'text',
      help: 'Generic drug name as FDA lists it, such as amoxicillin. Give either a drug name or a class, not both.',
      example: 'amoxicillin',
    },
    {
      key: 'class',
      label: 'Therapeutic class',
      type: 'text',
      help: 'Therapeutic category as FDA lists it, such as Oncology, instead of a drug name. Leave empty when you give a drug name.',
      // Empty: the connector takes a drug name or a class, never both.
      example: '',
    },
  ],
  estimate(q) {
    const s = shortageSearch(q)
    return {
      requests: MAX_PAGES,
      items: [
        {
          datasetId: 'fda-shortage-records',
          label: `FDA shortage records for ${s.term} (up to ${PAGE * MAX_PAGES} records)`,
          kind: 'text',
          bytes: PAGE * MAX_PAGES * 700,
        },
        {
          datasetId: 'fda-shortage-board',
          label: 'One line per drug presentation for a shortage board',
          kind: 'text',
          bytes: PAGE * MAX_PAGES * 300,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const s = shortageSearch(q)
    const records: ShortageRecord[] = []
    let updated = 'unknown'
    let total = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const got = await getPage(ctx, s, page * PAGE)
      if (!got) break
      total = got.meta.results.total
      updated = got.meta.last_updated ?? updated
      records.push(...got.results)
      if (records.length >= total || got.results.length < PAGE) break
    }
    const retrievedDay = new Date().toISOString().slice(0, 10)
    const entries = records.map((r) => ({
      t: fdaDate(r.initial_posting_date) ?? `${retrievedDay}T00:00:00Z`,
      title: `${r.generic_name ?? 'Drug'}${r.company_name ? ` (${r.company_name})` : ''}`,
      text: recordText(r),
    }))
    const board = records.map((r) => ({
      t: fdaDate(r.update_date) ?? fdaDate(r.initial_posting_date) ?? `${retrievedDay}T00:00:00Z`,
      title: r.generic_name ?? 'Drug',
      text: [
        r.presentation ?? '',
        r.package_ndc ?? '',
        r.status ?? '',
        r.availability ?? '',
        r.related_info ?? '',
      ].join(' | '),
    }))
    return {
      datasets: [
        {
          id: 'fda-shortage-records',
          kind: 'text',
          label: `FDA shortage records, ${s.term}`,
          file: 'fda-shortage-records.json',
          range: q.range,
          area: q.area,
        },
        {
          id: 'fda-shortage-board',
          kind: 'text',
          label: `FDA shortage board lines, ${s.term}`,
          file: 'fda-shortage-board.json',
          range: q.range,
          area: q.area,
        },
      ],
      files: [
        { name: 'fda-shortage-records.json', data: JSON.stringify(entries) },
        { name: 'fda-shortage-board.json', data: JSON.stringify(board) },
      ],
      modified: `Filtered to ${s.field === 'generic_name' ? 'drug' : 'class'} "${s.term}" (${records.length} of ${total} matching records read); each record is shown as the FDA published it, dated by its initial posting date.`,
      citation: `FDA drug shortages database via openFDA (api.fda.gov), data last updated ${updated}, retrieved ${retrievedDay}. The FDA says not to rely on this data for medical decisions; it is a snapshot of the current state, not a past day's supply.`,
    }
  },
}
