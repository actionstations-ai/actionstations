// Case datasets (replayed or simulated) as the data the earth science figure kinds take, so one
// scenario's figures and injects draw from the same numbers. Pure; each function reads the shapes
// the connectors and generators write (ADR-0092) and returns a figure `data` object.
interface Feature {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: Record<string, unknown>
}
interface Collection {
  features?: Feature[]
}
interface SeriesPoint {
  t: string
  v: number | Record<string, number>
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function lonLat(f: Feature): { lon: number; lat: number } | undefined {
  const c = f.geometry?.coordinates
  return Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'
    ? { lon: c[0], lat: c[1] }
    : undefined
}

export function shakemapFigureData(
  grid: Collection,
  opts: { title?: string; places?: Collection; quake?: Collection; faults?: Collection } = {},
) {
  const g = grid.features?.[0]?.properties?.grid
  if (!g) throw new Error('The dataset has no intensity grid')
  const epi = opts.quake?.features?.find((f) => f.geometry?.type === 'Point')
  const epiAt = epi ? lonLat(epi) : undefined
  return {
    title: opts.title ?? 'ShakeMap: estimated shaking intensity',
    grid: g,
    ...(epiAt ? { epicenter: { ...epiAt, label: 'Epicenter' } } : {}),
    places: (opts.places?.features ?? []).flatMap((f) => {
      const at = lonLat(f)
      const mmi = num(f.properties?.mmi)
      return at && mmi !== undefined
        ? [{ name: str(f.properties?.name), ...at, mmi: Math.min(10, Math.max(1, mmi)) }]
        : []
    }),
    faults: (opts.faults?.features ?? []).flatMap((f) => {
      const c = f.geometry?.coordinates
      return f.geometry?.type === 'LineString' && Array.isArray(c)
        ? [
            {
              name: str(f.properties?.name) || undefined,
              points: (c as number[][]).map(([lon, lat]) => ({ lon, lat })),
            },
          ]
        : []
    }),
  }
}

export function epicenterFigureData(
  quake: Collection,
  aftershocks: Collection,
  title = 'Mainshock and aftershocks',
) {
  const main = quake.features?.find((f) => f.geometry?.type === 'Point')
  const at = main ? lonLat(main) : undefined
  if (!main || !at) throw new Error('The dataset has no epicenter')
  return {
    title,
    mainshock: {
      ...at,
      magnitude: num(main.properties?.magnitude) ?? 0,
      label: str(main.properties?.name) || undefined,
    },
    events: (aftershocks.features ?? []).flatMap((f) => {
      const p = lonLat(f)
      const magnitude = num(f.properties?.magnitude)
      return p && magnitude !== undefined ? [{ ...p, magnitude }] : []
    }),
    faults: (quake.features ?? []).flatMap((f) => {
      const c = f.geometry?.coordinates
      return f.geometry?.type === 'LineString' && Array.isArray(c)
        ? [
            {
              name: str(f.properties?.name) || undefined,
              points: (c as number[][]).map(([lon, lat]) => ({ lon, lat })),
            },
          ]
        : []
    }),
  }
}

export function aftershockPlotData(
  aftershocks: Collection,
  mainshockMagnitude: number,
  minMagnitude = 2.5,
  title = 'Aftershock sequence',
) {
  return {
    title,
    mainshockMagnitude,
    xUnit: 'days' as const,
    minMagnitude,
    events: (aftershocks.features ?? []).flatMap((f) => {
      const t = num(f.properties?.daysAfter)
      const magnitude = num(f.properties?.magnitude)
      return t !== undefined && magnitude !== undefined ? [{ t, magnitude }] : []
    }),
  }
}

export function eewTimelineData(
  places: Collection,
  origin: string,
  title = 'Early warning: alert against shaking arrival',
) {
  return {
    title,
    origin,
    places: (places.features ?? []).flatMap((f) => {
      const p = f.properties ?? {}
      const distanceKm = num(p.distanceKm)
      const alertSec = num(p.alertSec)
      const shakingSec = num(p.shakingSec)
      return distanceKm !== undefined && alertSec !== undefined && shakingSec !== undefined
        ? [{ name: str(p.name), distanceKm, alertSec, shakingSec }]
        : []
    }),
  }
}

const valueOf = (p: SeriesPoint): number =>
  typeof p.v === 'number' ? p.v : (Object.values(p.v)[0] ?? 0)

export function monitoringFigureData(
  panels: { label: string; unit?: string; series: SeriesPoint[] }[],
  annotations: { x: string; label: string }[] = [],
  title = 'Volcano monitoring',
) {
  return {
    title,
    panels: panels.map((p) => ({
      label: p.label,
      ...(p.unit ? { unit: p.unit } : {}),
      points: p.series.map((s) => ({ x: s.t, y: valueOf(s) })),
    })),
    annotations,
  }
}

export function gaugeRecordFigureData(
  station: string,
  observed: SeriesPoint[],
  predicted: SeriesPoint[] = [],
  arrivals: { x: string; label: string }[] = [],
  title?: string,
) {
  return {
    ...(title ? { title } : {}),
    station,
    unit: 'm',
    observed: observed.map((s) => ({ x: s.t, y: valueOf(s) })),
    predicted: predicted.map((s) => ({ x: s.t, y: valueOf(s) })),
    arrivals,
  }
}

/** A waveform series (a fetched seismogram) as seismogram figure data; the rate comes from the spacing of the times. */
export function seismogramFigureData(
  series: SeriesPoint[],
  id: { network?: string; station: string; channel?: string },
  picks: { phase: string; seconds: number }[] = [],
  citation?: string,
) {
  if (series.length < 2) throw new Error('A seismogram needs at least two samples')
  const dt =
    (Date.parse(series[series.length - 1]!.t) - Date.parse(series[0]!.t)) /
    (series.length - 1) /
    1000
  return {
    ...(id.network ? { network: id.network } : {}),
    station: id.station,
    ...(id.channel ? { channel: id.channel } : {}),
    start: series[0]!.t.replace('T', ' ').slice(0, 19) + ' UTC',
    sampleRateHz: Math.round((1 / dt) * 1000) / 1000,
    unit: 'counts',
    samples: series.map(valueOf),
    picks,
    ...(citation ? { citation } : {}),
  }
}
