// GDELT connector (spec 0458 FR-11): the shape of real news coverage of a recent event, to
// calibrate the news cycle simulator's volume curve. It reads two timelines from the GDELT DOC
// 2.0 API for a keyword query: volume (coverage as a share of everything GDELT monitored) and
// average tone. Only numbers are kept; no article text, outlet, URL or person from the archive
// enters an inject. The DOC API searches a rolling window of the last three months, so a
// request for an older period is refused before any call.
//
// Terms (https://www.gdeltproject.org/about.html): datasets are available for unlimited and
// unrestricted use for any academic, commercial or governmental use without fee; any use or
// redistribution must cite the GDELT Project and link to https://www.gdeltproject.org/.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { registerConnector, hasConnector, type Connector, type ConnectorQuery } from './registry'

export const GDELT_HOST = 'api.gdeltproject.org'
export const GDELT_CITATION = 'The GDELT Project, https://www.gdeltproject.org/'
export const GDELT_TERMS =
  'GDELT datasets are available for unlimited and unrestricted use for any academic, commercial or governmental use without fee. Any use or redistribution must cite the GDELT Project and link to https://www.gdeltproject.org/.'

const DAY_MS = 86_400_000
/** The DOC API searches this far back (about three months). */
export const GDELT_WINDOW_DAYS = 90
const MAX_QUERY_CHARS = 200
const BYTES_PER_POINT = 48

/** The time step GDELT uses for a timeline over a span. */
export function gdeltStepMinutes(spanMs: number): 15 | 60 | 1440 {
  const hours = spanMs / 3_600_000
  return hours < 72 ? 15 : hours <= 168 ? 60 : 1440
}

function parseRange(query: ConnectorQuery, now: number): { start: number; end: number } {
  const start = Date.parse(query.range.start)
  const end = Date.parse(query.range.end)
  if (!(end > start)) throw new AppError('VALIDATION', 'The period must end after it starts.')
  if (start < now - GDELT_WINDOW_DAYS * DAY_MS)
    throw new AppError(
      'VALIDATION',
      'GDELT searches only the last three months, so this period is too old for it.',
    )
  if (end > now + 60_000) throw new AppError('VALIDATION', 'The period cannot end in the future.')
  return { start, end }
}

function keywords(query: ConnectorQuery): string {
  const q = String(query.options.query ?? '').trim()
  if (!q) throw new AppError('VALIDATION', 'Give the words to search for.')
  if (q.length > MAX_QUERY_CHARS)
    throw new AppError(
      'VALIDATION',
      `The search words are limited to ${MAX_QUERY_CHARS} characters.`,
    )
  return q
}

const stamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14)

/** The DOC API address for one timeline mode. */
export function gdeltUrl(
  mode: 'timelinevol' | 'timelinetone',
  q: string,
  start: number,
  end: number,
): string {
  const params = new URLSearchParams({
    query: q,
    mode,
    format: 'json',
    startdatetime: stamp(start),
    enddatetime: stamp(end),
  })
  return `https://${GDELT_HOST}/api/v2/doc/doc?${params.toString()}`
}

const Timeline = z.object({
  timeline: z
    .array(
      z.object({
        data: z.array(z.object({ date: z.string(), value: z.number() })),
      }),
    )
    .min(1),
})

/** `20260901T120000Z` to ISO. */
function isoOf(date: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date)
  if (!m) throw new AppError('VALIDATION', 'GDELT returned a date this app does not understand.')
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`
}

/** The points of a timeline response as case-data series points. */
export function parseTimeline(bytes: Uint8Array): { t: string; v: number }[] {
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new AppError('VALIDATION', 'GDELT did not return a timeline. Try different search words.')
  }
  const parsed = Timeline.safeParse(json)
  if (!parsed.success)
    throw new AppError('VALIDATION', 'GDELT returned a timeline in a shape this app does not know.')
  return parsed.data.timeline[0]!.data.map((p) => ({ t: isoOf(p.date), v: p.value }))
}

export const gdeltConnector: Connector = {
  id: 'gdelt',
  label: 'GDELT: news volume and tone over time',
  source: 'The GDELT Project (DOC 2.0 API)',
  terms: GDELT_TERMS,
  hosts: [GDELT_HOST],
  options: [
    {
      key: 'query',
      label: 'Search words',
      type: 'text',
      required: true,
      help: 'Words to search news coverage for, up to 200 characters; put a phrase in double quotes, such as "water main break".',
      example: 'power outage',
    },
  ],
  /** GDELT searches only the last three months, so the example period is the two days before now. */
  get exampleRange() {
    const now = Date.now()
    return {
      start: new Date(now - 2 * DAY_MS).toISOString(),
      end: new Date(now - DAY_MS).toISOString(),
    }
  },
  estimate(query) {
    const { start, end } = parseRange(query, Date.now())
    keywords(query)
    const points = Math.round((end - start) / (gdeltStepMinutes(end - start) * 60_000)) + 1
    return {
      requests: 2,
      items: [
        {
          datasetId: 'gdelt-volume',
          label: 'News volume (share of coverage)',
          kind: 'series',
          bytes: points * BYTES_PER_POINT,
        },
        {
          datasetId: 'gdelt-tone',
          label: 'Average news tone',
          kind: 'series',
          bytes: points * BYTES_PER_POINT,
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const { start, end } = parseRange(query, Date.now())
    const q = keywords(query)
    const get = async (mode: 'timelinevol' | 'timelinetone') => {
      const r = await ctx.get(gdeltUrl(mode, q, start, end))
      if (r.status !== 200)
        throw new AppError('INTERNAL', `GDELT answered with status ${r.status}. Try again later.`)
      return parseTimeline(r.data)
    }
    const volume = await get('timelinevol')
    const tone = await get('timelinetone')
    const range = { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
    return {
      datasets: [
        {
          id: 'gdelt-volume',
          kind: 'series',
          label: 'News volume (share of coverage)',
          file: 'gdelt-volume.json',
          range,
          unit: '% of coverage',
        },
        {
          id: 'gdelt-tone',
          kind: 'series',
          label: 'Average news tone',
          file: 'gdelt-tone.json',
          range,
          unit: 'tone',
        },
      ],
      files: [
        { name: 'gdelt-volume.json', data: JSON.stringify(volume) },
        { name: 'gdelt-tone.json', data: JSON.stringify(tone) },
      ],
      citation: GDELT_CITATION,
    }
  },
}

/** Register the connector once; the app calls this at startup. */
export function registerGdeltConnector(): void {
  if (!hasConnector(gdeltConnector.id)) registerConnector(gdeltConnector)
}
