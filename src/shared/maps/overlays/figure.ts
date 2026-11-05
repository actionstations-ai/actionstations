// A map figure (#652, NFR-3): the overlays drawn on a plain frame, with a legend, a text summary
// and a data table. This is what snapshots and exports embed, and the function a figure registry
// calls for a `map` figure: it needs no window, so it runs in tests and on any platform.
import type { OverlayLayer } from '../../schemas/map-overlays'
import { formatLatLon } from '../schematic'
import { legendEntries, type LegendEntry, type LegendItem } from './legend'
import { rasterStats } from './raster'
import { escapeXml, overlaySvg, type FigureMarker } from './svg'
import { filterAt, formatRange, formatStep, timeSteps } from './time'

export interface MapFigureInput {
  title: string
  layers: readonly OverlayLayer[]
  markers?: readonly FigureMarker[]
  /** A moment (ms since epoch) to show; null or absent shows everything. */
  at?: number | null
  width?: number
  idPrefix?: string
}

export interface MapFigure {
  svg: string
  width: number
  height: number
  /** Plain text for the figure's alt text and the page. */
  summary: string
  legend: LegendEntry[]
  /** The same information as the drawing, for people who cannot see it. */
  table: { columns: string[]; rows: string[][] }
}

const NOUN: Record<OverlayLayer['kind'], [string, string]> = {
  polygon: ['area', 'areas'],
  line: ['line', 'lines'],
  cone: ['cone', 'cones'],
  point: ['point', 'points'],
  raster: ['frame', 'frames'],
}

export const featureCount = (layer: OverlayLayer): number =>
  layer.kind === 'raster' ? layer.frames.length : layer.features.length

function layerPhrase(layer: OverlayLayer): string {
  const n = featureCount(layer)
  const noun = NOUN[layer.kind][n === 1 ? 0 : 1]
  return `${layer.title} (${n} ${noun})`
}

export function overlaySummary(
  title: string,
  all: readonly OverlayLayer[],
  shown: readonly OverlayLayer[],
  at: number | null,
  markers: number,
): string {
  const steps = timeSteps(all)
  const parts = [`Map: ${title}.`]
  parts.push(
    shown.length
      ? `${shown.length} overlay layer${shown.length === 1 ? '' : 's'}: ${shown.map(layerPhrase).join('; ')}.`
      : 'No overlays are shown.',
  )
  if (markers) parts.push(`${markers} numbered place${markers === 1 ? '' : 's'}.`)
  if (steps.length)
    parts.push(
      at === null
        ? `Times run from ${formatStep(steps[0]!)} to ${formatStep(steps[steps.length - 1]!)}; all are shown.`
        : `Shown at ${formatStep(at)}.`,
    )
  return parts.join(' ')
}

export const TABLE_COLUMNS = ['Layer', 'Item', 'Kind', 'Time', 'Where or value']
const MAX_TABLE_ROWS = 300

export function overlayTableRows(layers: readonly OverlayLayer[]): string[][] {
  const rows: string[][] = []
  for (const layer of layers) {
    if (layer.kind === 'raster') {
      for (const f of layer.frames) {
        const s = rasterStats(f)
        const unit = layer.colorScale.unit ? ` ${layer.colorScale.unit}` : ''
        rows.push([
          layer.title,
          f.label ?? f.id,
          'raster',
          formatRange(f.time),
          s ? `${s.min} to ${s.max}${unit}, ${s.count} cells` : 'no data',
        ])
      }
      continue
    }
    for (const f of layer.features as {
      id: string
      label: string
      detail?: string | undefined
      time?: Parameters<typeof formatRange>[0]
      at?: [number, number]
      value?: number | undefined
      unit?: string | undefined
      rings?: [number, number][][]
      path?: [number, number][]
    }[]) {
      const pts = f.at ? [f.at] : (f.rings?.[0] ?? f.path ?? [])
      const mid = pts.length
        ? formatLatLon({
            lon: (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2,
            lat: (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2,
          })
        : ''
      const reading = f.value !== undefined ? `${f.value}${f.unit ? ` ${f.unit}` : ''}, ` : ''
      rows.push([
        layer.title,
        f.label || f.id,
        layer.kind,
        formatRange(f.time),
        `${reading}${f.detail ? `${f.detail}, ` : ''}${mid ? `near ${mid}` : ''}`.replace(
          /, $/,
          '',
        ),
      ])
    }
  }
  return rows.slice(0, MAX_TABLE_ROWS)
}

/** Draw the layers (at one moment, or all of them) with a legend, summary and data table. */
export function mapFigure(input: MapFigureInput): MapFigure {
  const at = input.at ?? null
  const shown = filterAt(input.layers, at).filter((l) => featureCount(l) > 0)
  const markers = input.markers ?? []
  const summary = overlaySummary(input.title, input.layers, shown, at, markers.length)
  const drawn = overlaySvg({
    layers: shown,
    fitLayers: input.layers,
    markers,
    title: input.title,
    description: summary,
    ...(input.width ? { width: input.width } : {}),
    ...(input.idPrefix ? { idPrefix: input.idPrefix } : {}),
  })
  return {
    svg: drawn.svg,
    width: drawn.width,
    height: drawn.height,
    summary,
    legend: legendEntries(shown),
    table: { columns: TABLE_COLUMNS, rows: overlayTableRows(shown) },
  }
}

function swatch(entry: LegendEntry, item: LegendItem): string {
  const stroke = `stroke="${item.color}" stroke-width="2"${item.dash.length ? ` stroke-dasharray="${item.dash.map((d) => d * 2).join(' ')}"` : ''}`
  const inner =
    entry.swatch === 'line'
      ? `<path d="M1,7 L23,7" ${stroke} fill="none"/>`
      : entry.swatch === 'point'
        ? `<circle cx="12" cy="7" r="5" fill="${item.color}" fill-opacity="0.5" ${stroke}/>`
        : `<rect x="1" y="1" width="22" height="12" fill="${item.color}" fill-opacity="${entry.swatch === 'ramp' ? 1 : 0.4}" ${stroke}/>`
  return `<svg width="24" height="14" viewBox="0 0 24 14" aria-hidden="true">${inner}</svg>`
}

/** The legend as escaped HTML: one list per layer, each item a swatch and its text. */
export function legendHtml(entries: readonly LegendEntry[]): string {
  return entries
    .map(
      (e) =>
        `<div class="mapfig-legend__layer"><b>${escapeXml(e.label)}</b>` +
        (e.note ? ` <span class="muted">${escapeXml(e.note)}</span>` : '') +
        `<ul>${e.items
          .map((i) => `<li>${swatch(e, i)} ${escapeXml(i.label)}</li>`)
          .join('')}</ul></div>`,
    )
    .join('')
}
