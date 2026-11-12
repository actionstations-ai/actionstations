// HDX operational presence connector (spec 0469 FR-9): who works where, by sector and admin
// area, from the Humanitarian Data Exchange's HAPI service (hapi.humdata.org), which serves the
// country 3W (operational presence) datasets. The result seeds a realistic partner and sector
// structure for a scenario's country.
//
// HAPI asks every caller to identify itself with an application name and a contact address
// (base64 of "name:address"); it does not approve them. The app's own are sent unless the user
// gives theirs in the fetch form. Neither is a secret and neither is logged (#1099).
// The licence of each source dataset is read from data.humdata.org at fetch time and stored with
// the data; a dataset whose licence is not an open one is marked for this scenario only.
// Both hosts are fixed in code. Nothing runs without the user's consent.
import { APP_CONTACT } from '../../case-data/http'
import { AppError } from '../../lib/errors'
import {
  type Connector,
  type ConnectorOption,
  type ConnectorQuery,
  type ConnectorResult,
  type FetchContext,
} from './registry'

const HAPI = 'hapi.humdata.org'
const HDX = 'data.humdata.org'
const PAGE = 1000
const MAX_PAGES = 20
const BYTES_PER_ROW = 520

const ISO3 = /^[A-Z]{3}$/
const CODE = /^[A-Za-z0-9_-]{1,24}$/
const APP = /^[A-Za-z0-9 ._-]{3,60}$/
const CONTACT = /^[^\s@]{1,64}@[^\s@]{1,120}\.[A-Za-z]{2,24}$/
export const APP_NAME = 'ActionStations'

/** Licences that allow redistribution of the data in an exported pack. */
const OPEN_LICENCES = /creative commons|\bcc[- ]by|\bcc0|public domain|open data commons|\bodc\b/i

interface Row {
  org_name?: string
  org_acronym?: string
  org_type_description?: string
  sector_code?: string
  sector_name?: string
  admin1_name?: string
  admin2_name?: string
  reference_period_start?: string
  reference_period_end?: string
  resource_hdx_id?: string
}

export function identifier(q: ConnectorQuery): string {
  const app = String(q.options.applicationName ?? '').trim() || APP_NAME
  const contact = String(q.options.contactEmail ?? '').trim() || APP_CONTACT
  if (!APP.test(app) || !CONTACT.test(contact))
    throw new AppError(
      'VALIDATION',
      'The application name or contact address given for HDX is not valid. Leave both empty to use the app’s own.',
    )
  return Buffer.from(`${app}:${contact}`).toString('base64')
}

/** The country option HDX, HAPI and GDACS connectors share (#1139). */
export const LOCATION_OPTION: ConnectorOption = {
  key: 'location',
  label: 'Country',
  type: 'text',
  required: true,
  help: 'Three-letter ISO country code in capitals, such as SDN for Sudan or HTI for Haiti.',
  example: 'SDN',
}

/** The name and address HAPI asks callers to identify themselves with; the app's own if empty. */
export const HAPI_IDENTITY_OPTIONS: readonly ConnectorOption[] = [
  {
    key: 'applicationName',
    label: 'Application name for HDX',
    type: 'text',
    help: 'Optional name HAPI records for your requests (3 to 60 letters, digits, spaces, dots or dashes); the app sends its own when empty.',
    example: 'ActionStations',
  },
  {
    key: 'contactEmail',
    label: 'Contact email for HDX',
    type: 'text',
    help: 'Optional email address HAPI records with the application name; the app sends its own when empty.',
    example: 'exercises@example.org',
  },
]

export function locationOf(q: ConnectorQuery): string {
  const l = String(q.options.location ?? '').toUpperCase()
  if (!ISO3.test(l))
    throw new AppError(
      'VALIDATION',
      'Give the country as a three-letter ISO code (option "location")',
    )
  return l
}

function filters(q: ConnectorQuery): Record<string, string> {
  const out: Record<string, string> = { location_code: locationOf(q) }
  for (const k of ['sector', 'admin1'] as const) {
    const v = q.options[k]
    if (v === undefined || v === '') continue
    if (typeof v !== 'string' || !CODE.test(v))
      throw new AppError('VALIDATION', `Invalid ${k} code`)
    out[k === 'sector' ? 'sector_code' : 'admin1_code'] = v
  }
  return out
}

export function presenceUrl(q: ConnectorQuery, offset: number): string {
  const qs = new URLSearchParams({
    ...filters(q),
    output_format: 'json',
    limit: String(PAGE),
    offset: String(offset),
    app_identifier: identifier(q),
  })
  return `https://${HAPI}/api/v2/coordination-context/operational-presence?${qs}`
}

async function getJson(ctx: FetchContext, url: string, who: string): Promise<unknown> {
  const r = await ctx.get(url)
  if (r.status !== 200) throw new AppError('PROVIDER', `${who} answered ${r.status}`)
  try {
    return JSON.parse(new TextDecoder().decode(r.data))
  } catch {
    throw new AppError(
      'PROVIDER',
      `${who} sent a response that is not JSON; the service may have changed.`,
    )
  }
}

const isRows = (v: unknown): v is { data: Row[] } =>
  typeof v === 'object' && v !== null && Array.isArray((v as { data?: unknown }).data)

/** Read the licence of the dataset a resource belongs to; an unreadable licence is not open. */
async function licenceOf(ctx: FetchContext, datasetId: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/.test(datasetId)) return 'unknown'
  try {
    const got = (await getJson(
      ctx,
      `https://${HDX}/api/3/action/package_show?id=${datasetId}`,
      'data.humdata.org',
    )) as { result?: { license_title?: string } }
    return got.result?.license_title?.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * The licences of the datasets behind up to `max` HAPI resources, read from HAPI's resource
 * metadata and data.humdata.org. `open` is true only when every licence read allows
 * redistribution; none read is not open. Shared by the HAPI connectors.
 */
export async function readLicences(
  q: ConnectorQuery,
  ctx: FetchContext,
  resourceIds: readonly (string | undefined)[],
  max = 3,
): Promise<{ text: string; open: boolean }> {
  const ids = [...new Set(resourceIds.filter((x): x is string => !!x))].slice(0, max)
  const licences: string[] = []
  for (const id of ids) {
    const meta = (await getJson(
      ctx,
      `https://${HAPI}/api/v2/metadata/resource?resource_hdx_id=${encodeURIComponent(id)}&limit=1&app_identifier=${identifier(q)}`,
      'HDX HAPI',
    )) as { data?: { dataset_hdx_id?: string }[] }
    const dsId = meta.data?.[0]?.dataset_hdx_id
    licences.push(dsId ? await licenceOf(ctx, dsId) : 'unknown')
  }
  return {
    text: licences.length ? [...new Set(licences)].join('; ') : 'unknown',
    open: licences.length > 0 && licences.every((l) => OPEN_LICENCES.test(l)),
  }
}

export const hdxOperationalPresence: Connector = {
  id: 'hdx-operational-presence',
  label: 'HDX operational presence (3W) by country',
  source: 'Humanitarian Data Exchange, HAPI operational presence (hapi.humdata.org)',
  terms:
    'Published by OCHA and country offices. The licence of each source dataset is read when you fetch and kept with the data; data under a licence that does not allow redistribution stays in this scenario and is not exported in packs.',
  hosts: [HAPI, HDX],
  options: [
    LOCATION_OPTION,
    {
      key: 'sector',
      label: 'Sector code',
      type: 'text',
      help: 'Optional HDX sector code such as HEA (health) or WSH (water, sanitation and hygiene); every sector when left empty.',
      example: 'HEA',
    },
    {
      key: 'admin1',
      label: 'Admin 1 code',
      type: 'text',
      help: 'Optional first-level admin area code (a P-code such as SD01) from the country page on data.humdata.org; the whole country when left empty.',
      example: 'SD01',
    },
    ...HAPI_IDENTITY_OPTIONS,
  ],
  estimate(q) {
    locationOf(q)
    identifier(q)
    const rows = 4 * PAGE
    return {
      requests: 1 + Math.ceil(rows / PAGE),
      items: [
        {
          datasetId: 'hdx-3w-rows',
          label: `Operational presence rows, ${locationOf(q)} (partner, sector, admin area, period)`,
          kind: 'text',
          bytes: rows * BYTES_PER_ROW,
        },
        {
          datasetId: 'hdx-3w-summary',
          label: 'Partners reporting by sector and admin area',
          kind: 'text',
          bytes: 12_000,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const rows: Row[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const got = await getJson(ctx, presenceUrl(q, page * PAGE), 'HDX HAPI')
      if (!isRows(got))
        throw new AppError(
          'PROVIDER',
          'HDX HAPI returned an unexpected shape; the service may have changed.',
        )
      rows.push(...got.data)
      if (got.data.length < PAGE) break
    }
    const { text: licenceText, open } = await readLicences(
      q,
      ctx,
      rows.map((r) => r.resource_hdx_id),
    )
    const place = locationOf(q)
    const t = q.range.start
    const cells = new Map<string, Set<string>>()
    for (const r of rows) {
      const key = `${r.admin1_name ?? 'unknown area'} | ${r.sector_name ?? r.sector_code ?? 'unknown sector'}`
      const set = cells.get(key) ?? new Set<string>()
      set.add(r.org_acronym || r.org_name || 'unnamed')
      cells.set(key, set)
    }
    const summary = [...cells.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, orgs]) => ({
        t,
        title: key,
        text: `${orgs.size} organizations reporting: ${[...orgs].sort().slice(0, 12).join(', ')}.`,
      }))
    return {
      datasets: [
        {
          id: 'hdx-3w-rows',
          kind: 'text',
          label: `Operational presence, ${place} (rows)`,
          file: 'hdx-3w-rows.json',
          range: q.range,
        },
        {
          id: 'hdx-3w-summary',
          kind: 'text',
          label: `Partners by sector and admin area, ${place}`,
          file: 'hdx-3w-summary.json',
          range: q.range,
        },
      ],
      files: [
        {
          name: 'hdx-3w-rows.json',
          data: JSON.stringify(
            rows.slice(0, 5000).map((r) => ({
              t: r.reference_period_start ? `${r.reference_period_start.slice(0, 19)}Z` : t,
              title: `${r.org_acronym || r.org_name || 'unnamed'}: ${r.sector_name ?? r.sector_code ?? ''}`,
              text: `${r.org_name ?? ''} (${r.org_type_description ?? 'type not stated'}) in ${r.admin2_name ?? r.admin1_name ?? 'unknown area'}.`,
            })),
          ),
        },
        { name: 'hdx-3w-summary.json', data: JSON.stringify(summary) },
      ],
      modified: `Filtered to ${place}${q.options.sector ? `, sector ${String(q.options.sector)}` : ''}; rows beyond 5000 left out of the row list; grouped by admin area and sector in the summary.`,
      citation: `OCHA and country offices, via HDX HAPI operational presence, ${place}. Licence read at fetch: ${licenceText}.${open ? '' : ' Used in this scenario only; not exported in packs.'}`,
    }
  },
}
