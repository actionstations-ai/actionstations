// USGS ComCat replay connector (spec 0450 FR-9): find a past earthquake by period, area and
// magnitude, or take one by event id, and fetch its products: the ShakeMap intensity grid and
// contours, the "Did You Feel It?" community intensities and the PAGER estimate. U.S. government
// data (public domain). The catalog query is the same FDSN event service the hazard data uses
// (hazards/sources/usgs.ts); products come from the event detail's own links, on the same host.
//
// Datasets: comcat-events (points), shakemap-grid (one feature whose `grid` property is the MMI
// grid, north row first, for the shakemap_intensity figure), shakemap-contours (lines), dyfi-communities
// (polygons) and pager-estimate (text, for the PAGER alert template).
import { AppError } from '../../../lib/errors'
import { USGS_EVENT_QUERY } from '../../../hazards/sources/usgs'
import {
  registerConnector,
  type Connector,
  type ConnectorQuery,
  type ConnectorResult,
} from '../registry'
import {
  checkRange,
  featureCollection,
  getJson,
  isRecord,
  isoSecond,
  item,
  jsonFile,
  numberOption,
  patternOption,
} from './common'

export const COMCAT_HOST = 'earthquake.usgs.gov'
const EVENT_ID = /^[a-z0-9_]{4,40}$/
const PRODUCT_LIST = /^(shakemap|dyfi|pager)(,(shakemap|dyfi|pager))*$/
const MAX_COLS = 100
const EVENT_LIMIT = 20

const PRODUCT_BYTES = {
  events: 30_000,
  detail: 120_000,
  shakemap: 200_000,
  dyfi: 700_000,
  pager: 6_000,
}

type Product = 'shakemap' | 'dyfi' | 'pager'

export function productsOf(q: ConnectorQuery): Product[] {
  const raw = patternOption(q, 'products', PRODUCT_LIST, 'product list (shakemap, dyfi, pager)')
  const list = (raw ?? 'shakemap,dyfi,pager').split(',') as Product[]
  return [...new Set(list)]
}

export function eventIdOf(q: ConnectorQuery): string | undefined {
  return patternOption(q, 'eventId', EVENT_ID, 'event id')
}

/** The catalog query URL: one period, one area, a magnitude floor, biggest first. */
export function catalogUrl(
  q: ConnectorQuery,
  base: string = USGS_EVENT_QUERY,
  ignorePeriod = false,
): string {
  if (!ignorePeriod) checkRange(q, 366)
  const p = new URLSearchParams({
    format: 'geojson',
    ...(ignorePeriod
      ? {}
      : { starttime: isoSecond(q.range.start), endtime: isoSecond(q.range.end) }),
    minmagnitude: String(numberOption(q, 'minMagnitude', 5, 0, 9.9)),
    orderby: 'magnitude',
    limit: String(EVENT_LIMIT),
  })
  const b = q.area.bbox
  if (b) {
    p.set('minlongitude', String(b[0]))
    p.set('minlatitude', String(b[1]))
    p.set('maxlongitude', String(b[2]))
    p.set('maxlatitude', String(b[3]))
  }
  return `${base}?${p.toString()}`
}

export const detailUrl = (eventId: string, base: string = USGS_EVENT_QUERY): string =>
  `${base}?${new URLSearchParams({ eventid: eventId, format: 'geojson' }).toString()}`

interface EventFeature {
  geometry?: { coordinates?: number[] }
  id?: string
  properties?: Record<string, unknown>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** A catalog feature as the case-data feature the figures and the text read. */
export function eventFeature(f: EventFeature): unknown {
  const c = f.geometry?.coordinates ?? []
  const p = f.properties ?? {}
  const time = num(p.time)
  if (c.length < 2 || time === undefined)
    throw new AppError('INTERNAL', 'An event came back without a place or time')
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: c.slice(0, 3) },
    properties: {
      name: str(p.title) || str(p.place),
      id: f.id ?? '',
      magnitude: num(p.mag),
      magnitudeType: str(p.magType),
      time: new Date(time).toISOString(),
      depthKm: c[2],
      place: str(p.place),
      status: str(p.status),
      felt: num(p.felt),
      cdi: num(p.cdi),
      mmi: num(p.mmi),
      alert: p.alert ?? null,
      tsunami: num(p.tsunami) === 1,
      url: str(p.url),
    },
  }
}

interface Coverage {
  domain?: {
    axes?: {
      x?: { start: number; stop: number; num: number }
      y?: { start: number; stop: number; num: number }
    }
  }
  ranges?: Record<string, { axisNames?: string[]; shape?: number[]; values?: (number | null)[] }>
}

export interface MmiGrid {
  west: number
  south: number
  east: number
  north: number
  cols: number
  rows: number
  values: number[]
}

/** The ShakeMap MMI coverage as a north-first grid, block-averaged down to at most MAX_COLS columns. */
export function gridFromCoverage(cov: Coverage): { grid: MmiGrid; resampled: boolean } {
  const ax = cov.domain?.axes
  const range = cov.ranges?.MMI
  if (!ax?.x || !ax.y || !range?.values)
    throw new AppError('INTERNAL', 'The ShakeMap grid has an unexpected shape')
  const cols = ax.x.num
  const rows = ax.y.num
  if (range.values.length !== cols * rows)
    throw new AppError('INTERNAL', 'The ShakeMap grid does not match its size')
  const dx = cols > 1 ? (ax.x.stop - ax.x.start) / (cols - 1) : 0
  const dy = rows > 1 ? (ax.y.stop - ax.y.start) / (rows - 1) : 0
  const at = (r: number, c: number): number => {
    const v = range.values![r * cols + c]
    return typeof v === 'number' ? v : 1
  }
  // Rows run from the first y value; put the northernmost row first.
  const southFirst = dy >= 0
  const f = Math.max(1, Math.ceil(cols / MAX_COLS))
  const oc = Math.ceil(cols / f)
  const or = Math.ceil(rows / f)
  const values: number[] = []
  for (let r = 0; r < or; r++) {
    const rr = southFirst ? or - 1 - r : r
    for (let c = 0; c < oc; c++) {
      let sum = 0
      let n = 0
      for (let i = rr * f; i < Math.min(rows, rr * f + f); i++)
        for (let j = c * f; j < Math.min(cols, c * f + f); j++) {
          sum += at(i, j)
          n++
        }
      values.push(Math.round((sum / n) * 10) / 10)
    }
  }
  const half = Math.abs(dx) / 2
  const halfY = Math.abs(dy) / 2
  const south = Math.min(ax.y.start, ax.y.stop) - halfY
  const north = Math.max(ax.y.start, ax.y.stop) + halfY
  return {
    grid: {
      west: ax.x.start - half,
      south,
      east: ax.x.stop + half,
      north,
      cols: oc,
      rows: or,
      values,
    },
    resampled: f > 1,
  }
}

interface ProductEntry {
  contents?: Record<string, { url?: string }>
  properties?: Record<string, unknown>
}

function productOf(detail: unknown, name: string): ProductEntry | undefined {
  const products =
    isRecord(detail) && isRecord(detail.properties) ? detail.properties.products : undefined
  const list = isRecord(products) ? products[name] : undefined
  return Array.isArray(list) && list.length ? (list[0] as ProductEntry) : undefined
}

const link = (p: ProductEntry | undefined, key: string): string | undefined =>
  p?.contents?.[key]?.url

function pagerText(
  alerts: unknown,
  exposures: unknown,
  comments: unknown,
  props: Record<string, unknown>,
) {
  const a = isRecord(alerts) ? alerts : {}
  const level = (k: string): string =>
    isRecord(a[k]) ? str((a[k] as Record<string, unknown>).level) : ''
  const bins = (k: string): string => {
    const b = isRecord(a[k])
      ? (a[k] as { bins?: { color?: string; min?: string; max?: string; probability?: number }[] })
          .bins
      : undefined
    const top = [...(b ?? [])].sort((x, y) => (y.probability ?? 0) - (x.probability ?? 0))[0]
    return top ? `${top.min} to ${top.max}` : ''
  }
  const exp =
    isRecord(exposures) && isRecord(exposures.population_exposure)
      ? exposures.population_exposure
      : {}
  const mmi = (exp as { mmi?: number[] }).mmi ?? []
  const pop = (exp as { aggregated_exposure?: number[] }).aggregated_exposure ?? []
  const rows = mmi
    .map((m, i) => `MMI ${m}: ${pop[i] ?? 0} people`)
    .filter((_, i) => (pop[i] ?? 0) > 0)
  const c = isRecord(comments) ? comments : {}
  return [
    `PAGER alert level ${str(props.alertlevel)} (maximum MMI ${str(props.maxmmi)})`,
    level('fatality')
      ? `Fatalities: ${level('fatality')} alert, most likely range ${bins('fatality')}`
      : '',
    level('economic')
      ? `Economic losses: ${level('economic')} alert, most likely range ${bins('economic')} (USD)`
      : '',
    ...rows,
    str(c.struct_comment),
    str(c.secondary_comment),
  ]
    .filter(Boolean)
    .join('\n')
}

export interface EventConnectorConfig {
  id: string
  label: string
  source: string
  terms: string
  /** The FDSN query address of the service (events and scenarios share one shape). */
  base: string
  /** The scenario catalog has no real dates: ask for scenarios by magnitude and area only. */
  ignorePeriod?: boolean
  /** Appended to product names ("-scenario" for the scenario catalog). */
  suffix: string
  /** Prepended to every dataset label, so scenarios are never read as real earthquakes. */
  labelPrefix: string
  citation: (eventId: string) => string
  catalogCitation: string
}

export function makeEventConnector(cfg: EventConnectorConfig): Connector {
  const named = (s: string): string => `${cfg.labelPrefix}${s}`
  return {
    id: cfg.id,
    label: cfg.label,
    source: cfg.source,
    terms: cfg.terms,
    hosts: [COMCAT_HOST],
    estimate(q) {
      const id = eventIdOf(q)
      const products = productsOf(q)
      if (!id) {
        catalogUrl(q, cfg.base, cfg.ignorePeriod)
        return {
          items: [
            item(
              'comcat-events',
              named('Earthquake catalog (up to 20 events)'),
              'features',
              PRODUCT_BYTES.events,
            ),
          ],
          requests: 1,
        }
      }
      return {
        items: [
          item('comcat-events', named('The event'), 'features', PRODUCT_BYTES.detail),
          ...(products.includes('shakemap')
            ? [
                item('shakemap-grid', named('ShakeMap intensity grid'), 'features', 130_000),
                item('shakemap-contours', named('ShakeMap intensity contours'), 'features', 70_000),
              ]
            : []),
          ...(products.includes('dyfi')
            ? [
                item(
                  'dyfi-communities',
                  named('"Did You Feel It?" community intensity'),
                  'features',
                  PRODUCT_BYTES.dyfi,
                ),
              ]
            : []),
          ...(products.includes('pager')
            ? [item('pager-estimate', named('PAGER estimate'), 'text', PRODUCT_BYTES.pager)]
            : []),
        ],
        requests:
          1 +
          (products.includes('shakemap') ? 2 : 0) +
          (products.includes('dyfi') ? 1 : 0) +
          (products.includes('pager') ? 3 : 0),
      }
    },
    async fetch(q, ctx): Promise<ConnectorResult> {
      const id = eventIdOf(q)
      const files: ConnectorResult['files'] = []
      const datasets: ConnectorResult['datasets'] = []
      if (!id) {
        const list = await getJson<{ features?: EventFeature[] }>(
          ctx,
          catalogUrl(q, cfg.base, cfg.ignorePeriod),
          'The USGS catalog',
        )
        const features = (list.features ?? []).map(eventFeature)
        files.push(jsonFile('comcat-events.geojson', featureCollection(features)))
        datasets.push({
          id: 'comcat-events',
          kind: 'features',
          label: named(`Earthquakes M ${numberOption(q, 'minMagnitude', 5, 0, 9.9)} and larger`),
          file: 'comcat-events.geojson',
          ...(cfg.ignorePeriod ? {} : { range: q.range }),
          ...(q.area.bbox ? { area: q.area } : {}),
        })
        return { datasets, files, citation: cfg.catalogCitation }
      }
      const detail = await getJson<EventFeature>(ctx, detailUrl(id, cfg.base), 'The USGS catalog')
      const ev = eventFeature(detail) as { properties: { name: string; time: string } }
      files.push(jsonFile('comcat-events.geojson', featureCollection([ev])))
      datasets.push({
        id: 'comcat-events',
        kind: 'features',
        label: named(ev.properties.name),
        file: 'comcat-events.geojson',
        range: { start: ev.properties.time, end: ev.properties.time },
      })
      const wanted = productsOf(q)
      let modified: string | undefined
      const shake = wanted.includes('shakemap')
        ? productOf(detail, `shakemap${cfg.suffix}`)
        : undefined
      const gridUrl = link(shake, 'download/coverage_mmi_low_res.covjson')
      if (gridUrl) {
        const { grid, resampled } = gridFromCoverage(
          await getJson<Coverage>(ctx, gridUrl, 'The ShakeMap service'),
        )
        if (resampled)
          modified = `ShakeMap intensity grid averaged into blocks to at most ${MAX_COLS} columns.`
        const ring = [
          [grid.west, grid.south],
          [grid.east, grid.south],
          [grid.east, grid.north],
          [grid.west, grid.north],
          [grid.west, grid.south],
        ]
        files.push(
          jsonFile(
            'shakemap-grid.geojson',
            featureCollection([
              {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [ring] },
                properties: { name: 'ShakeMap intensity grid', grid },
              },
            ]),
          ),
        )
        datasets.push({
          id: 'shakemap-grid',
          kind: 'features',
          label: named('ShakeMap intensity (MMI)'),
          file: 'shakemap-grid.geojson',
          unit: 'MMI',
          area: { label: '', bbox: [grid.west, grid.south, grid.east, grid.north] },
        })
      }
      const contUrl = link(shake, 'download/cont_mmi.json')
      if (contUrl) {
        files.push(
          jsonFile(
            'shakemap-contours.geojson',
            await getJson(ctx, contUrl, 'The ShakeMap service'),
          ),
        )
        datasets.push({
          id: 'shakemap-contours',
          kind: 'features',
          label: named('ShakeMap intensity contours'),
          file: 'shakemap-contours.geojson',
          unit: 'MMI',
        })
      }
      const dyfi = wanted.includes('dyfi') ? productOf(detail, `dyfi${cfg.suffix}`) : undefined
      const dyfiUrl = link(dyfi, 'dyfi_geo_10km.geojson')
      if (dyfiUrl) {
        files.push(
          jsonFile('dyfi-communities.geojson', await getJson(ctx, dyfiUrl, 'The DYFI service')),
        )
        datasets.push({
          id: 'dyfi-communities',
          kind: 'features',
          label: named('"Did You Feel It?" community intensity (10 km cells)'),
          file: 'dyfi-communities.geojson',
          unit: 'MMI',
        })
      }
      const pager = wanted.includes('pager')
        ? productOf(detail, `losspager${cfg.suffix}`)
        : undefined
      if (pager) {
        const [alerts, exposures, comments] = await Promise.all(
          ['json/alerts.json', 'json/exposures.json', 'json/comments.json'].map((k) => {
            const u = link(pager, k)
            return u ? getJson(ctx, u, 'The PAGER service') : Promise.resolve({})
          }),
        )
        files.push(
          jsonFile('pager-estimate.json', [
            {
              t: ev.properties.time,
              title: named('PAGER estimate'),
              text: pagerText(alerts, exposures, comments, pager.properties ?? {}),
            },
          ]),
        )
        datasets.push({
          id: 'pager-estimate',
          kind: 'text',
          label: named('PAGER estimate'),
          file: 'pager-estimate.json',
        })
      }
      return {
        datasets,
        files,
        ...(modified ? { modified } : {}),
        citation: cfg.citation(id),
      }
    },
  }
}

export const comcat: Connector = makeEventConnector({
  id: 'comcat',
  label: 'USGS earthquake catalog and event products',
  source: 'USGS ComCat (earthquake.usgs.gov)',
  terms: 'U.S. government work, public domain. Cite the USGS and the event id.',
  base: USGS_EVENT_QUERY,
  suffix: '',
  labelPrefix: '',
  citation: (id) =>
    `U.S. Geological Survey, event ${id}, ShakeMap, Did You Feel It? and PAGER products, https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
  catalogCitation:
    'U.S. Geological Survey, Earthquake Catalog (ComCat), https://earthquake.usgs.gov/earthquakes/search/',
})

export const registerComcat = (): void => registerConnector(comcat)
