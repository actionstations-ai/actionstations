// GDACS disaster events (spec 0469 FR-9, #911): the disasters the Global Disaster Alert and
// Coordination System recorded for one country in a period, with their alert level, severity
// and GLIDE number, as a timeline for a scenario. GDACS is run by the European Commission's
// Joint Research Centre and UN OCHA, and its event API needs no key or registration, so it gives
// every user the past-event record that ReliefWeb gives only to approved application names.
//
// The search asks for orange and red alerts, the events at a humanitarian scale (a whole year of
// them fits in one page); the option `includeGreen` adds green alerts, which are far more
// numerous (mostly small earthquakes and forest fires) and are read up to a page limit. The
// search is not filtered by country on the server, whose country filter is unreliable ("TUR"
// returns Turkmenistan, "Congo" misses the Democratic Republic of the Congo): the connector
// keeps the events whose affected countries include the ISO code. Hosts are fixed in code;
// nothing runs without consent, and the request carries only dates and alert levels.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { locationOf } from './humanitarian-hdx'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

const HOST = 'www.gdacs.org'
const TYPES = 'EQ;TC;FL;VO;DR;WF'
const PAGE = 100
const MAX_PAGES = 10
const MAX_ROWS = 300
const BYTES_PER_PAGE = 140_000
const BYTES_PER_ROW = 400

const KIND: Record<string, string> = {
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcanic eruption',
  DR: 'Drought',
  WF: 'Forest fire',
}

const str = z.string().nullable().optional()
const Event = z.looseObject({
  properties: z.looseObject({
    eventtype: z.string(),
    eventid: z.union([z.number(), z.string()]),
    name: str,
    glide: str,
    alertlevel: str,
    country: str,
    fromdate: z.string(),
    todate: str,
    istemporary: str,
    affectedcountries: z
      .array(z.looseObject({ iso3: str, countryname: str }))
      .nullable()
      .optional(),
    severitydata: z.looseObject({ severitytext: str }).nullable().optional(),
    url: z.looseObject({ report: str }).nullable().optional(),
  }),
})
type Event = z.infer<typeof Event>
const Page = z.looseObject({ features: z.array(Event) })

const day = (iso: string): string => iso.slice(0, 10)

const withGreen = (q: ConnectorQuery): boolean => q.options.includeGreen === true
/** Orange and red alerts fit in one page or two; green alerts may need every page allowed. */
const pagesFor = (q: ConnectorQuery): number => (withGreen(q) ? MAX_PAGES : 2)

/** One page of the event search for the scenario's period. Pure; used by estimate and fetch. */
export function eventsUrl(q: ConnectorQuery, page: number): string {
  const p = new URLSearchParams({
    eventlist: TYPES,
    fromDate: day(q.range.start),
    toDate: day(q.range.end),
    alertlevel: withGreen(q) ? 'Green;Orange;Red' : 'Orange;Red',
    pagenumber: String(page),
  })
  return `https://${HOST}/gdacsapi/api/events/geteventlist/SEARCH?${p}`
}

/** Read one page; a 204 (no content) means the search has no more pages. */
async function getPage(ctx: FetchContext, url: string): Promise<Event[] | undefined> {
  const r = await ctx.get(url)
  if (r.status === 204 || r.data.length === 0) return undefined
  if (r.status !== 200) throw new AppError('PROVIDER', `GDACS answered ${r.status}`)
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(r.data))
  } catch {
    throw new AppError('PROVIDER', 'GDACS did not return JSON; the service may have changed.')
  }
  const parsed = Page.safeParse(body)
  if (!parsed.success)
    throw new AppError(
      'PROVIDER',
      'GDACS returned an unexpected shape; the service may have changed.',
    )
  return parsed.data.features
}

const affects = (e: Event, iso3: string): boolean =>
  (e.properties.affectedcountries ?? []).some((c) => c.iso3?.toUpperCase() === iso3)

/** The timeline entries for one event: its onset and, for an event that lasts, its end. */
export function entriesOf(e: Event): { t: string; title: string; text: string }[] {
  const p = e.properties
  const kind = KIND[p.eventtype] ?? p.eventtype
  const alert = p.alertlevel ? `${p.alertlevel} alert` : 'Alert level not given'
  const title = `${kind}: ${p.name || p.country || 'unnamed event'}`.slice(0, 200)
  const facts = [
    `${alert}.`,
    p.severitydata?.severitytext ? `${p.severitydata.severitytext}.` : '',
    p.country ? `Countries: ${p.country.replace(/,\s*,/g, ',')}.` : '',
    p.glide ? `GLIDE ${p.glide}.` : '',
    p.istemporary === 'true' ? 'GDACS marks this event as provisional.' : '',
    p.url?.report ? `Report: ${p.url.report}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const start = { t: `${p.fromdate.slice(0, 19)}Z`, title, text: facts }
  const end = p.todate?.slice(0, 19)
  if (!end || end === p.fromdate.slice(0, 19)) return [start]
  return [
    start,
    { t: `${end}Z`, title: `${title} (last GDACS update of the event)`, text: alert + '.' },
  ]
}

export const gdacsEvents: Connector = {
  id: 'gdacs-events',
  label: 'GDACS disaster events for a country and period',
  source:
    'Global Disaster Alert and Coordination System (European Commission JRC and UN OCHA), www.gdacs.org event API',
  terms:
    'GDACS publishes its alerts for public use; cite GDACS as the source. Alert levels and severities are automatic estimates made in the first hours of an event and are revised; they are not damage assessments.',
  hosts: [HOST],
  estimate(q) {
    const iso3 = locationOf(q)
    const pages = pagesFor(q)
    const levels = withGreen(q) ? 'green, orange and red' : 'orange and red'
    return {
      requests: pages,
      items: [
        {
          datasetId: 'gdacs-timeline',
          label: `Disaster events with ${levels} alerts affecting ${iso3}, up to ${MAX_ROWS} entries (reads up to ${pages * PAGE} events worldwide to find them)`,
          kind: 'text',
          bytes: MAX_ROWS * BYTES_PER_ROW + pages * BYTES_PER_PAGE,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const iso3 = locationOf(q)
    const kept: Event[] = []
    let more = false
    const pages = pagesFor(q)
    for (let page = 1; page <= pages; page++) {
      const events = await getPage(ctx, eventsUrl(q, page))
      if (!events) break
      kept.push(...events.filter((e) => affects(e, iso3)))
      if (events.length < PAGE) break
      if (page === pages) more = true
    }
    const seen = new Set<string>()
    const entries = kept
      .filter((e) => {
        const key = `${e.properties.eventtype}${e.properties.eventid}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .flatMap(entriesOf)
      .sort((a, b) => a.t.localeCompare(b.t))
    const rows = entries.slice(0, MAX_ROWS)
    const cut = [
      more
        ? `the search had more than ${pagesFor(q) * PAGE} events worldwide and was stopped there; shorten the period to see the rest`
        : '',
      entries.length > MAX_ROWS ? `the first ${MAX_ROWS} of ${entries.length} entries kept` : '',
    ].filter(Boolean)
    return {
      datasets: [
        {
          id: 'gdacs-timeline',
          kind: 'text',
          label: `GDACS disaster events, ${iso3}`,
          file: 'gdacs-timeline.json',
          range: q.range,
        },
      ],
      files: [{ name: 'gdacs-timeline.json', data: JSON.stringify(rows) }],
      modified: `${withGreen(q) ? 'Green, orange and red' : 'Orange and red'} alerts in the period whose affected countries include ${iso3}; type, name, alert level, severity, countries, GLIDE number and report link only${cut.length ? `; ${cut.join('; ')}` : ''}.`,
      citation: `GDACS, Global Disaster Alert and Coordination System (European Commission Joint Research Centre and UN OCHA). Events affecting ${iso3}, ${day(q.range.start)} to ${day(q.range.end)}.`,
    }
  },
}
