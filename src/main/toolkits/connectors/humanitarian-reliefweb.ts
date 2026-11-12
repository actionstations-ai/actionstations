// ReliefWeb connector (spec 0469 FR-9): disaster entries and report titles for a past event, to
// build a timeline. ReliefWeb's API (api.reliefweb.int, v2) needs an approved application name
// (since 1 November 2025); the user gives their own in the fetch form. It identifies an application
// and is not a secret, but it is never logged. Without it the connector refuses and the bundled
// sample data is used. Only titles, dates, sources and links are kept: report bodies are the
// publishers' content and stay on ReliefWeb. The host is fixed in code.
import { AppError } from '../../lib/errors'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

const HOST = 'api.reliefweb.int'
const PAGE = 100
const BYTES_PER_ROW = 700
const MAX_ROWS = 300
const APPNAME = /^[A-Za-z0-9._-]{3,60}$/
const COUNTRY = /^[A-Za-z][A-Za-z .'-]{1,59}$/

export function appnameOf(q: ConnectorQuery): string {
  const a = String(q.options.applicationName ?? '').trim()
  if (!APPNAME.test(a))
    throw new AppError(
      'VALIDATION',
      'ReliefWeb needs an approved application name: give yours in the fetch form. Without it this source is off and the sample data is used.',
    )
  return a
}

export function countryOf(q: ConnectorQuery): string {
  const c = q.area.label.trim()
  if (!COUNTRY.test(c))
    throw new AppError('VALIDATION', 'Name the country (letters, spaces and punctuation only)')
  return c
}

export function reportsUrl(q: ConnectorQuery): string {
  const p = new URLSearchParams()
  p.set('appname', appnameOf(q))
  p.set('limit', String(Math.min(PAGE, MAX_ROWS)))
  p.set('profile', 'minimal')
  p.append('sort[]', 'date.created:asc')
  for (const f of ['title', 'date.created', 'source.name', 'url', 'format.name'])
    p.append('fields[include][]', f)
  p.set('filter[operator]', 'AND')
  p.set('filter[conditions][0][field]', 'country.name')
  p.set('filter[conditions][0][value]', countryOf(q))
  p.set('filter[conditions][1][field]', 'date.created')
  p.set('filter[conditions][1][value][from]', q.range.start)
  p.set('filter[conditions][1][value][to]', q.range.end)
  return `https://${HOST}/v2/reports?${p}`
}

interface Item {
  fields?: {
    title?: string
    date?: { created?: string }
    source?: { name?: string }[]
    url?: string
  }
}

async function getReports(ctx: FetchContext, url: string): Promise<Item[]> {
  const r = await ctx.get(url)
  if (r.status === 403)
    throw new AppError(
      'PROVIDER',
      'ReliefWeb refused the application name; request an approved name and give it in the fetch form.',
    )
  if (r.status !== 200) throw new AppError('PROVIDER', `ReliefWeb answered ${r.status}`)
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(r.data))
  } catch {
    throw new AppError(
      'PROVIDER',
      'ReliefWeb sent a response that is not JSON; the service may have changed.',
    )
  }
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data))
    throw new AppError(
      'PROVIDER',
      'ReliefWeb returned an unexpected shape; the service may have changed.',
    )
  return data as Item[]
}

export const reliefwebReports: Connector = {
  id: 'reliefweb-reports',
  label: 'ReliefWeb reports for a country and period',
  source: 'ReliefWeb (UN OCHA), api.reliefweb.int v2',
  terms:
    'ReliefWeb lists reports published by many sources; each remains the content of its publisher. Only titles, dates, source names and links are kept, for this scenario, and are not exported in packs.',
  hosts: [HOST],
  options: [
    {
      key: 'applicationName',
      label: 'ReliefWeb application name',
      type: 'text',
      required: true,
      help: 'The application name ReliefWeb approved for you (3 to 60 letters, digits, dots, dashes or underscores); request one at apidoc.reliefweb.int.',
      example: 'MyOrgExercises',
    },
  ],
  area: {
    label: 'required',
    help: 'The country name as ReliefWeb spells it, such as Haiti or Sudan.',
    example: { label: 'Haiti' },
  },
  estimate(q) {
    appnameOf(q)
    countryOf(q)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'reliefweb-timeline',
          label: `Report titles, dates and sources, ${countryOf(q)}, up to ${MAX_ROWS}`,
          kind: 'text',
          bytes: MAX_ROWS * BYTES_PER_ROW,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const items = await getReports(ctx, reportsUrl(q))
    const entries = items.flatMap((i) => {
      const f = i.fields
      if (!f?.title || !f.date?.created) return []
      const src = f.source
        ?.map((s) => s.name)
        .filter(Boolean)
        .join(', ')
      return [
        {
          t: f.date.created.replace(/\+00:00$/, 'Z'),
          title: f.title.slice(0, 200),
          text:
            `${src ? `Source: ${src}. ` : ''}${f.url ? `Link: ${f.url}` : ''}`.trim() ||
            'No source listed.',
        },
      ]
    })
    return {
      datasets: [
        {
          id: 'reliefweb-timeline',
          kind: 'text',
          label: `ReliefWeb report timeline, ${countryOf(q)}`,
          file: 'reliefweb-timeline.json',
          range: q.range,
        },
      ],
      files: [{ name: 'reliefweb-timeline.json', data: JSON.stringify(entries) }],
      modified: `Filtered to ${countryOf(q)} and the period; titles, dates, sources and links only; at most ${MAX_ROWS} reports.`,
      citation: `ReliefWeb, UN OCHA. Report titles listed for ${countryOf(q)}; each report is the content of its source.`,
    }
  },
}
