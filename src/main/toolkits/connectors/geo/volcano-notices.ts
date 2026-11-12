// USGS Hazards Notification System (HANS) replay connector (spec 0450 FR-9): volcano observatory
// notices for aviation (VONAs) sent in the last year, with the full text of each. U.S. government
// data (public domain). The service offers its archive by search request only, so this connector
// reads what a plain GET returns: the VONAs of the past year. Older notices are linked from the
// volcano's page and can be pasted into a scenario by hand. Dataset: volcano-notices (text, one
// entry per notice, newest last) and vona-alert-levels (series of the alert level over time).
import { AppError } from '../../../lib/errors'
import {
  registerConnector,
  type Connector,
  type ConnectorQuery,
  type ConnectorResult,
} from '../registry'
import {
  checkRange,
  getJson,
  getText,
  isRecord,
  item,
  jsonFile,
  patternOption,
  pool,
} from './common'

export const HANS_HOST = 'volcanoes.usgs.gov'
const BASE = `https://${HANS_HOST}/hans-public/api/notice`
const MAX_NOTICES = 12
const NOTICE_ID = /^DOI-USGS-[A-Z]{2,5}-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
const VOLCANO = /^[A-Za-z][A-Za-z '.-]{1,40}$/

interface Vona {
  sent_utc?: string
  obs_abbr?: string
  notice_identifier?: string
  volcano_name?: string
  vnum?: string
  alert_level?: string
  color_code?: string
  synopsis_complete?: string
  latitude?: number
  longitude?: number
}

const iso = (sentUtc: string): string => `${sentUtc.replace(' ', 'T')}Z`

export function volcanoOf(q: ConnectorQuery): string | undefined {
  return patternOption(q, 'volcano', VOLCANO, 'volcano name')
}

/** Notices inside the period (and for the named volcano, when given), oldest first. */
export function selectNotices(all: unknown, q: ConnectorQuery): Vona[] {
  if (!Array.isArray(all)) throw new AppError('INTERNAL', 'HANS did not return a list of notices')
  const start = Date.parse(q.range.start)
  const end = Date.parse(q.range.end)
  const name = volcanoOf(q)?.toLowerCase()
  return (all as unknown[])
    .filter(isRecord)
    .map((r) => r as Vona)
    .filter((n) => {
      const t = n.sent_utc ? Date.parse(iso(n.sent_utc)) : NaN
      return (
        t >= start && t <= end && (!name || (n.volcano_name ?? '').toLowerCase().includes(name))
      )
    })
    .filter((n) => NOTICE_ID.test(n.notice_identifier ?? ''))
    .sort((a, b) => Date.parse(iso(a.sent_utc!)) - Date.parse(iso(b.sent_utc!)))
    .slice(0, MAX_NOTICES)
}

export const volcanoNotices: Connector = {
  id: 'volcano-notices',
  label: 'Volcano notices for aviation (past year)',
  source: 'USGS Hazards Notification System (volcanoes.usgs.gov)',
  terms:
    'U.S. government work, public domain. Cite the USGS volcano observatory that sent each notice.',
  hosts: [HANS_HOST],
  options: [
    {
      key: 'volcano',
      label: 'Volcano',
      type: 'text',
      help: 'Optional volcano name, or part of it, such as Kilauea or Shishaldin; notices for every volcano when left empty.',
      example: 'Kilauea',
    },
  ],
  estimate(q) {
    checkRange(q, 366)
    return {
      items: [
        item('volcano-notices', 'Notice texts (up to 12)', 'text', 120_000 + MAX_NOTICES * 1_500),
        item('vona-alert-levels', 'Alert level and color code over time', 'series', 4_000),
      ],
      requests: 1 + MAX_NOTICES,
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    checkRange(q, 366)
    const notices = selectNotices(
      await getJson(ctx, `${BASE}/getVonasWithinLastYear`, 'The volcano notification service'),
      q,
    )
    if (!notices.length)
      throw new AppError(
        'NOT_FOUND',
        'No notice for aviation in that period (the service keeps the past year)',
      )
    const texts = await pool(
      notices.map(
        (n) => () =>
          getText(
            ctx,
            `${BASE}/getNoticeFormatted/${encodeURIComponent(n.notice_identifier!)}/text`,
            'The volcano notification service',
          ),
      ),
      3,
    )
    const entries = notices.map((n, i) => ({
      t: iso(n.sent_utc!),
      title: `${n.volcano_name} ${n.alert_level}/${n.color_code}`,
      text: texts[i]!.trim(),
    }))
    const series = notices.map((n) => ({
      t: iso(n.sent_utc!),
      v: { level: ['NORMAL', 'ADVISORY', 'WATCH', 'WARNING'].indexOf(n.alert_level ?? '') },
    }))
    return {
      datasets: [
        {
          id: 'volcano-notices',
          kind: 'text',
          label: 'Volcano observatory notices for aviation',
          file: 'volcano-notices.json',
          range: { start: entries[0]!.t, end: entries[entries.length - 1]!.t },
        },
        {
          id: 'vona-alert-levels',
          kind: 'series',
          label: 'Alert level (0 normal, 1 advisory, 2 watch, 3 warning)',
          file: 'vona-alert-levels.json',
        },
      ],
      files: [
        jsonFile('volcano-notices.json', entries),
        jsonFile('vona-alert-levels.json', series),
      ],
      citation: `U.S. Geological Survey volcano observatories (${[...new Set(notices.map((n) => n.obs_abbr?.toUpperCase()))].join(', ')}), Hazards Notification System.`,
    }
  },
}

export const registerVolcanoNotices = (): void => registerConnector(volcanoNotices)
