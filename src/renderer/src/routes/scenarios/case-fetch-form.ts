// The fetch form's state and the query it sends (#1139). The connector declares its options and
// what it reads of the area; this turns what the person typed into the query `case:plan-fetch`
// takes, or says in words what is missing. Times are UTC: archives keep their records in UTC.
import type { ConnectorInfo, ConnectorOptionInfo } from '@shared/ipc/case-data'

export type OptionValue = string | number | boolean

export interface FetchForm {
  /** "YYYY-MM-DDTHH:MM", UTC */
  start: string
  end: string
  areaLabel: string
  /** west, south, east, north as typed */
  bbox: [string, string, string, string]
  options: Record<string, OptionValue | ''>
}

export interface FetchQuery {
  range: { start: string; end: string }
  area: { label: string; bbox?: [number, number, number, number] }
  options: Record<string, OptionValue>
}

export const BBOX_LABELS = ['West longitude', 'South latitude', 'East longitude', 'North latitude']

const pad = (n: number) => String(n).padStart(2, '0')
const minute = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`

/** A fresh form: the week before today, the connector's defaults, booleans off. */
export function initialForm(c: ConnectorInfo, now = new Date()): FetchForm {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end.getTime() - 7 * 86_400_000)
  const options: FetchForm['options'] = {}
  for (const o of c.options ?? []) options[o.key] = o.default ?? (o.type === 'boolean' ? false : '')
  return { start: minute(start), end: minute(end), areaLabel: '', bbox: ['', '', '', ''], options }
}

function optionValue(o: ConnectorOptionInfo, raw: OptionValue | ''): OptionValue | undefined {
  if (o.type === 'boolean') return raw === true
  if (raw === '' || raw === undefined) return undefined
  if (o.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
    return Number.isFinite(n) ? n : undefined
  }
  const s = String(raw).trim()
  return s === '' ? undefined : s
}

function readBbox(form: FetchForm, errors: string[]): [number, number, number, number] | undefined {
  if (form.bbox.every((v) => v.trim() === '')) return undefined
  const n = form.bbox.map((v) => Number(v.trim()))
  if (form.bbox.some((v) => v.trim() === '') || n.some((x) => !Number.isFinite(x))) {
    errors.push('Give all four edges of the box as numbers, or leave all four empty.')
    return undefined
  }
  const [w, s, e, north] = n as [number, number, number, number]
  if (Math.abs(w) > 180 || Math.abs(e) > 180 || Math.abs(s) > 90 || Math.abs(north) > 90)
    errors.push('Longitudes run from -180 to 180 and latitudes from -90 to 90.')
  else if (w >= e || s >= north)
    errors.push('West must be less than east, and south less than north.')
  return [w, s, e, north]
}

function readRange(form: FetchForm, errors: string[]): FetchQuery['range'] {
  const start = Date.parse(`${form.start}:00Z`)
  const end = Date.parse(`${form.end}:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) errors.push('Give a start and an end.')
  else if (end <= start) errors.push('The end must be after the start.')
  return { start: `${form.start}:00Z`, end: `${form.end}:00Z` }
}

/** The query for `case:plan-fetch`, or the problems in words. */
export function toQuery(
  c: ConnectorInfo,
  form: FetchForm,
): { query: FetchQuery; errors: string[] } {
  const errors: string[] = []
  const range = readRange(form, errors)
  const label = form.areaLabel.trim()
  if (c.area?.label === 'required' && !label) errors.push('Name the area.')
  const bbox = c.area?.bbox ? readBbox(form, errors) : undefined
  if (c.area?.bbox === 'required' && !bbox && !errors.some((e) => e.includes('box')))
    errors.push('Give the box: all four edges.')
  const options: FetchQuery['options'] = {}
  for (const o of c.options ?? []) {
    const v = optionValue(o, form.options[o.key] ?? '')
    if (v === undefined) {
      if (o.required) errors.push(`${o.label} is needed.`)
      else if (o.type === 'number' && form.options[o.key] !== '')
        errors.push(`${o.label} must be a number.`)
      continue
    }
    options[o.key] = v
  }
  return { query: { range, area: { label, ...(bbox ? { bbox } : {}) }, options }, errors }
}

/** Bytes in words: "740 KB", "3.2 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
