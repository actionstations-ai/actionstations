// SEC EDGAR reference connector (spec 0459 FR-11): find public Form 8-K filings that report
// Item 1.05 (material cybersecurity incidents) or Item 8.01 in a date range, and read the item's
// text from the first few, so the facilitator has real disclosure language to compare with.
//
// The data is for the facilitator only: it is stored as a scoring-shaped dataset (injects do not
// reference those) and generated exercise documents never name the real company. Only the
// item, the dates and an optional phrase leave the machine; nothing about the scenario does.
//
// Fair access (sec.gov/os/webmaster-faq#developers): a declared User-Agent with a contact (the
// user's own from Settings, else the app's: `contact: 'required'`), at most 10 requests a
// second (`minIntervalMs`), and two fixed hosts. No key or account is needed.
import { AppError } from '../../lib/errors'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

const SEARCH_HOST = 'efts.sec.gov'
const ARCHIVE_HOST = 'www.sec.gov'
const SEARCH_URL = `https://${SEARCH_HOST}/LATEST/search-index`
const PAGE = 100
const MAX_PAGES = 3
/** Hits kept, and hits whose item text is read. */
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25
const EXCERPT_DOCS = 3
const EXCERPT_CHARS = 1800
/** The first part of a filing document is enough to reach its items. */
const DOC_BYTES = 300_000
/** 10 requests a second is the SEC's limit; stay under it. */
export const EDGAR_MIN_INTERVAL_MS = 120

export const EDGAR_ITEMS = ['1.05', '8.01'] as const
const PHRASE = /^[A-Za-z0-9][A-Za-z0-9 ,.'-]{0,79}$/
const DEFAULT_PHRASE: Record<(typeof EDGAR_ITEMS)[number], string> = {
  '1.05': 'cybersecurity incident',
  '8.01': 'cybersecurity incident',
}

const isoDay = (iso: string): string => new Date(iso).toISOString().slice(0, 10)
const textOf = (data: Uint8Array): string => new TextDecoder().decode(data)

interface Params {
  item: (typeof EDGAR_ITEMS)[number]
  phrase: string
  limit: number
  startdt: string
  enddt: string
}

export function edgarParams(q: ConnectorQuery): Params {
  const item = String(q.options.item ?? '1.05')
  if (!(EDGAR_ITEMS as readonly string[]).includes(item))
    throw new AppError('VALIDATION', `Item must be one of: ${EDGAR_ITEMS.join(', ')}`)
  const typed = q.options.phrase === undefined ? '' : String(q.options.phrase).trim()
  if (typed !== '' && !PHRASE.test(typed))
    throw new AppError(
      'VALIDATION',
      'The search phrase may use letters, numbers, spaces and basic punctuation, up to 80 characters',
    )
  const limit = Number(q.options.limit ?? DEFAULT_LIMIT)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new AppError('VALIDATION', `Ask for 1 to ${MAX_LIMIT} filings`)
  const startdt = isoDay(q.range.start)
  const enddt = isoDay(q.range.end)
  if (enddt < startdt) throw new AppError('VALIDATION', 'The period ends before it starts')
  return {
    item: item as Params['item'],
    phrase: typed || DEFAULT_PHRASE[item as Params['item']],
    limit,
    startdt,
    enddt,
  }
}

export function edgarSearchUrl(p: Params, from: number): string {
  const qs = new URLSearchParams({
    q: `"${p.phrase}"`,
    forms: '8-K',
    dateRange: 'custom',
    startdt: p.startdt,
    enddt: p.enddt,
    from: String(from),
  })
  return `${SEARCH_URL}?${qs.toString()}`
}

export interface EdgarHit {
  adsh: string
  cik: string
  company: string
  fileDate: string
  form: string
  items: string[]
  document: string
}

/** The filings in one page of search results that report `item`; unusable rows are dropped. */
export function hitsFrom(json: unknown, item: string): { hits: EdgarHit[]; total: number } {
  const hits = (json as { hits?: { total?: { value?: number }; hits?: unknown[] } })?.hits
  if (!hits || !Array.isArray(hits.hits))
    throw new AppError('INTERNAL', 'EDGAR sent a response in a shape this app does not know')
  const out: EdgarHit[] = []
  for (const h of hits.hits) {
    const row = h as { _id?: unknown; _source?: Record<string, unknown> }
    const s = row._source
    if (!s || typeof row._id !== 'string') continue
    const items = Array.isArray(s.items)
      ? s.items.filter((x): x is string => typeof x === 'string')
      : []
    const document = row._id.split(':')[1]
    const cik = Array.isArray(s.ciks) && typeof s.ciks[0] === 'string' ? s.ciks[0] : ''
    const name =
      Array.isArray(s.display_names) && typeof s.display_names[0] === 'string'
        ? s.display_names[0]
        : ''
    if (!items.includes(item) || !document || !cik || typeof s.adsh !== 'string') continue
    if (typeof s.file_date !== 'string' || typeof s.form !== 'string') continue
    if (!/^[A-Za-z0-9._-]+$/.test(document) || !/^\d{10}-\d{2}-\d{6}$/.test(s.adsh)) continue
    out.push({
      adsh: s.adsh,
      cik,
      company: name.replace(/\s+\(CIK \d+\)\s*$/, '').trim() || 'Unnamed filer',
      fileDate: s.file_date,
      form: s.form,
      items,
      document,
    })
  }
  return { hits: out, total: typeof hits.total?.value === 'number' ? hits.total.value : out.length }
}

export const filingUrl = (h: EdgarHit): string =>
  `https://${ARCHIVE_HOST}/Archives/edgar/data/${Number(h.cik)}/${h.adsh.replace(/-/g, '')}/${h.document}`

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#8217;': "'",
  '&#8220;': '"',
  '&#8221;': '"',
  '&#160;': ' ',
}

/** Plain text of a filing's HTML: tags and scripts dropped, entities decoded, spaces collapsed. */
export function plainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#?\w+;/g, (m) => ENTITIES[m] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The text that follows the item's heading, up to the next item or a length limit. */
export function itemExcerpt(html: string, item: string): string | undefined {
  const text = plainText(html)
  const esc = item.replace('.', '\\.')
  const heading = new RegExp(`Item\\s+${esc}\\.?\\s`, 'gi')
  let best: string | undefined
  for (let m = heading.exec(text); m; m = heading.exec(text)) {
    const rest = text.slice(m.index)
    const next = rest.slice(12).search(/\bItem\s+\d+\.\d{2}\b|\bSIGNATURES?\b/i)
    const body = (next < 0 ? rest : rest.slice(0, next + 12)).slice(0, EXCERPT_CHARS).trim()
    // The table of contents also names the item; the real section is the longer one.
    if (!best || body.length > best.length) best = body
  }
  return best
}

async function getJson(ctx: FetchContext, url: string): Promise<unknown> {
  const r = await ctx.get(url)
  if (r.status !== 200) throw new AppError('INTERNAL', `SEC EDGAR answered ${r.status}`)
  try {
    return JSON.parse(textOf(r.data))
  } catch {
    throw new AppError('INTERNAL', 'SEC EDGAR sent a response that is not JSON')
  }
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const secEdgar8k: Connector = {
  id: 'sec-edgar-8k',
  label: 'SEC EDGAR Form 8-K filings (Item 1.05 or 8.01), for the facilitator',
  source: 'U.S. Securities and Exchange Commission, EDGAR full-text search and filing archive',
  terms:
    'Public filings on sec.gov. Fair access: a declared User-Agent with a contact (yours if set in Settings, else help@actionstations.ai) and at most 10 requests a second. For the facilitator as reference only; generated exercise documents never name the real company.',
  hosts: [SEARCH_HOST, ARCHIVE_HOST],
  contact: 'required',
  minIntervalMs: EDGAR_MIN_INTERVAL_MS,
  estimate(q) {
    const p = edgarParams(q)
    const docs = Math.min(EXCERPT_DOCS, p.limit)
    return {
      requests: 1 + docs,
      items: [
        {
          datasetId: 'edgar-8k-reference',
          label: `Form 8-K Item ${p.item} filings, ${p.startdt} to ${p.enddt}, with item text`,
          kind: 'reports',
          bytes: 90_000 + docs * DOC_BYTES,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const p = edgarParams(q)
    const found: EdgarHit[] = []
    let total = 0
    for (let page = 0; page < MAX_PAGES && found.length < p.limit; page++) {
      const got = hitsFrom(await getJson(ctx, edgarSearchUrl(p, page * PAGE)), p.item)
      total = got.total
      found.push(...got.hits)
      if (got.total <= (page + 1) * PAGE) break
    }
    const kept = found.slice(0, p.limit)
    const events = []
    for (const [i, h] of kept.entries()) {
      let excerpt: string | undefined
      if (i < EXCERPT_DOCS) {
        const doc = await ctx.get(filingUrl(h), { range: [0, DOC_BYTES - 1] })
        if (doc.status === 200 || doc.status === 206)
          excerpt = itemExcerpt(textOf(doc.data), p.item)
      }
      events.push({
        id: `${slug(h.company)}-${h.adsh}`.slice(0, 120),
        time: `${h.fileDate}T00:00:00Z`,
        kind: 'edgar_8k_reference',
        area: h.company.slice(0, 200),
        attrs: {
          facilitatorOnly: true,
          form: h.form,
          items: h.items,
          accession: h.adsh,
          link: filingUrl(h),
          ...(excerpt ? { excerpt } : {}),
        },
      })
    }
    return {
      datasets: [
        {
          id: 'edgar-8k-reference',
          kind: 'reports',
          shape: 'ground-truth',
          label: `Facilitator reference only: Form 8-K Item ${p.item} filings, ${p.startdt} to ${p.enddt}`,
          file: 'edgar-8k-reference.json',
          range: { start: `${p.startdt}T00:00:00Z`, end: `${p.enddt}T23:59:59Z` },
          area: q.area,
        },
      ],
      files: [{ name: 'edgar-8k-reference.json', data: JSON.stringify(events) }],
      modified: `Filtered to Form 8-K filings that report Item ${p.item} (${found.length} of ${total} search results matched the item); the first ${Math.min(EXCERPT_DOCS, kept.length)} filings carry the text that follows the item heading, cut to ${EXCERPT_CHARS} characters.`,
      citation: `U.S. Securities and Exchange Commission, EDGAR full-text search, Form 8-K, ${p.startdt} to ${p.enddt}. Retrieved from sec.gov.`,
    }
  },
}
