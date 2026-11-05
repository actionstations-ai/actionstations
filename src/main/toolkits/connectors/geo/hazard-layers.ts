// Fault traces and landslide assessment replay connectors (spec 0450 FR-9).
//
// quaternary-faults: the USGS Quaternary Fault and Fold Database (map service on
// earthquake.usgs.gov) for the area the user draws (at most 6 degrees on a side), as line
// features named by fault, for the epicenter and ShakeMap figures. U.S. public domain.
//
// landslide-assessments: USGS post-fire debris-flow hazard assessments published on ScienceBase.
// For a fire name it finds the assessment items and brings the summary, the citation and the
// median rainfall thresholds (a small CSV in each item) as text. The hazard polygons themselves
// are shapefiles; the text names the item so the user can fetch them, and the debris_flow_hazard_map
// figure takes basins that the scenario author draws or generates. Public domain (USGS).
import { AppError } from '../../../lib/errors'
import { registerConnector, type Connector, type ConnectorResult } from '../registry'
import {
  featureCollection,
  getJson,
  getText,
  isRecord,
  item,
  jsonFile,
  patternOption,
  requireBbox,
} from './common'

export const QFAULT_HOST = 'earthquake.usgs.gov'
export const SCIENCEBASE_HOST = 'www.sciencebase.gov'
const QFAULT_LAYER = `https://${QFAULT_HOST}/arcgis/rest/services/haz/Qfaults/MapServer/21/query`
const MAX_FAULTS = 1500
const MAX_SPAN_DEG = 6

export function faultsUrl(bbox: [number, number, number, number]): string {
  if (bbox[2] - bbox[0] > MAX_SPAN_DEG || bbox[3] - bbox[1] > MAX_SPAN_DEG)
    throw new AppError('VALIDATION', `Choose an area no more than ${MAX_SPAN_DEG} degrees across`)
  const p = new URLSearchParams({
    where: '1=1',
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    outFields: 'fault_name,section_name,slip_rate,age,class',
    geometryPrecision: '4',
    resultRecordCount: String(MAX_FAULTS),
    f: 'geojson',
  })
  return `${QFAULT_LAYER}?${p.toString()}`
}

export function faultFeatures(body: unknown): unknown[] {
  const features = isRecord(body) && Array.isArray(body.features) ? body.features : []
  return features.filter(isRecord).map((f) => {
    const p = isRecord(f.properties) ? f.properties : {}
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: String(p.fault_name ?? p.section_name ?? 'Unnamed fault'),
        section: String(p.section_name ?? ''),
        slipRate: String(p.slip_rate ?? ''),
        age: String(p.age ?? ''),
        class: String(p.class ?? ''),
      },
    }
  })
}

export const quaternaryFaults: Connector = {
  id: 'quaternary-faults',
  label: 'Quaternary fault traces',
  source: 'USGS Quaternary Fault and Fold Database (earthquake.usgs.gov)',
  terms: 'U.S. government work, public domain. Cite the USGS Quaternary Fault and Fold Database.',
  hosts: [QFAULT_HOST],
  estimate(q) {
    faultsUrl(requireBbox(q))
    return {
      items: [item('fault-traces', 'Fault traces in the area', 'features', 500_000)],
      requests: 1,
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const bbox = requireBbox(q)
    const features = faultFeatures(await getJson(ctx, faultsUrl(bbox), 'The fault database'))
    return {
      datasets: [
        {
          id: 'fault-traces',
          kind: 'features',
          label: 'Quaternary fault traces',
          file: 'fault-traces.geojson',
          area: q.area,
        },
      ],
      files: [jsonFile('fault-traces.geojson', featureCollection(features))],
      citation:
        'U.S. Geological Survey and state geological surveys, Quaternary Fault and Fold Database of the United States, https://www.usgs.gov/programs/earthquake-hazards/faults',
    }
  },
}

// ---- landslide assessments -------------------------------------------------------------------

const FIRE = /^[A-Za-z][A-Za-z0-9 '.-]{2,40}$/
const ITEM_ID = /^[0-9a-f]{24}$/
const SB = `https://${SCIENCEBASE_HOST}/catalog`
const MAX_ITEMS = 3

export function searchUrl(fire: string): string {
  const p = new URLSearchParams({
    q: `${fire} postfire debris-flow hazard assessment`,
    format: 'json',
    max: String(MAX_ITEMS),
    fields: 'title',
  })
  return `${SB}/items?${p.toString()}`
}

interface SbItem {
  id?: string
  title?: string
  summary?: string
  citation?: string
  files?: { name?: string; url?: string; size?: number }[]
}

export function thresholdFile(it: SbItem): { name: string; url: string } | undefined {
  const f = (it.files ?? []).find(
    (x) => /median-thresholds\.csv$/i.test(x.name ?? '') && x.url && (x.size ?? 0) < 200_000,
  )
  return f ? { name: f.name!, url: f.url! } : undefined
}

/** The USGS median-thresholds CSV as plain lines: rainfall accumulation (mm) per duration and likelihood. */
export function thresholdLines(csv: string): string[] {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(',').map((c) => c.trim()))
  const head = rows[0] ?? []
  const col = (name: string): number => head.indexOf(name)
  return rows.slice(1).flatMap((r) => {
    const parts = [15, 30, 60].flatMap((m) => {
      const lo = Number(r[col(`R${m}_50`)])
      const hi = Number(r[col(`R${m}_75`)])
      return Number.isFinite(lo) && Number.isFinite(hi)
        ? [
            `${m} minutes: ${lo.toFixed(1)} mm (50% likelihood of a debris flow), ${hi.toFixed(1)} mm (75%)`,
          ]
        : []
    })
    return parts.length ? [`${r[0]}: ${parts.join('; ')}`] : []
  })
}

export const landslideAssessments: Connector = {
  id: 'landslide-assessments',
  label: 'Post-fire debris-flow hazard assessments',
  source: 'USGS Landslide Hazards Program (ScienceBase)',
  terms: 'U.S. government work, public domain. Cite the USGS assessment and its ScienceBase item.',
  hosts: [SCIENCEBASE_HOST],
  estimate(q) {
    if (!patternOption(q, 'fire', FIRE, 'fire name'))
      throw new AppError('VALIDATION', 'Name the fire (for example Cedar Ridge)')
    return {
      items: [
        item(
          'debris-flow-assessments',
          'Assessment summaries and rainfall thresholds',
          'text',
          30_000 + MAX_ITEMS * 60_000,
        ),
      ],
      requests: 1 + MAX_ITEMS * 2,
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const fire = patternOption(q, 'fire', FIRE, 'fire name')
    if (!fire) throw new AppError('VALIDATION', 'Name the fire')
    const found = await getJson<{ items?: { id?: string }[] }>(ctx, searchUrl(fire), 'ScienceBase')
    const ids = (found.items ?? []).map((i) => i.id ?? '').filter((id) => ITEM_ID.test(id))
    if (!ids.length)
      throw new AppError('NOT_FOUND', `ScienceBase has no post-fire assessment matching "${fire}"`)
    const entries: { t: string; title: string; text: string }[] = []
    for (const id of ids) {
      const it = await getJson<SbItem>(ctx, `${SB}/item/${id}?format=json`, 'ScienceBase')
      const th = thresholdFile(it)
      const csv = th ? (await getText(ctx, th.url, 'ScienceBase')).trim() : ''
      entries.push({
        t: q.range.start,
        title: it.title ?? 'Debris-flow hazard assessment',
        text: [
          it.summary ?? '',
          csv
            ? `Median rainfall accumulation thresholds (USGS file ${th!.name}), the rain in the burned area that makes a debris flow this likely:\n${thresholdLines(csv).join('\n')}`
            : '',
          `Hazard polygons are in the item's shapefiles: ${SB}/item/${id}`,
          it.citation ? `Citation: ${it.citation}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      })
    }
    return {
      datasets: [
        {
          id: 'debris-flow-assessments',
          kind: 'text',
          label: `Post-fire debris-flow hazard assessments matching "${fire}"`,
          file: 'debris-flow-assessments.json',
        },
      ],
      files: [jsonFile('debris-flow-assessments.json', entries)],
      citation:
        'U.S. Geological Survey Landslide Hazards Program, Emergency Assessment of Post-Fire Debris-Flow Hazards, https://doi.org/10.5066/F79K48GC',
    }
  },
}

export const registerHazardLayers = (): void => {
  registerConnector(quaternaryFaults)
  registerConnector(landslideAssessments)
}
