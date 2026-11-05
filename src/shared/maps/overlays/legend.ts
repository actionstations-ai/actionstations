// The legend of a set of overlay layers (#652): one entry per layer, with one item per style the
// layer uses. Every item has text, and carries the colour, line pattern and hatch of its style so
// the legend does not depend on colour alone.
import type { OverlayLayer, OverlayToken } from '../../schemas/map-overlays'
import { TOKEN_STYLE, type Hatch } from './style'

export interface LegendItem {
  label: string
  /** The colour of the swatch. */
  color: string
  dash: number[]
  hatch: Hatch
  token?: OverlayToken
}

export interface LegendEntry {
  layerId: string
  /** The layer's legend text. */
  label: string
  note?: string
  kind: OverlayLayer['kind']
  swatch: 'area' | 'line' | 'point' | 'ramp'
  items: LegendItem[]
  /** For a raster: the unit of its scale. */
  unit?: string
}

const SWATCH: Record<OverlayLayer['kind'], LegendEntry['swatch']> = {
  polygon: 'area',
  cone: 'area',
  line: 'line',
  point: 'point',
  raster: 'ramp',
}

function tokenItems(layer: Exclude<OverlayLayer, { kind: 'raster' }>): LegendItem[] {
  const seen = new Map<OverlayToken, string>()
  for (const f of layer.features as { style: OverlayToken; legendLabel?: string | undefined }[]) {
    const had = seen.get(f.style)
    if (had === undefined || (!had && f.legendLabel)) seen.set(f.style, f.legendLabel ?? '')
  }
  if (seen.size === 0) seen.set('neutral', '')
  const several = seen.size > 1
  return [...seen].map(([token, label]) => {
    const style = TOKEN_STYLE[token]
    return {
      token,
      label: label || (several ? style.name : layer.legend.label),
      color: style.color,
      dash: style.dash,
      hatch: style.hatch,
    }
  })
}

/** "40 dBZ" for a stop: its own label, or its value and the unit. */
export const stopLabel = (
  stop: { value: number; label?: string | undefined },
  unit: string,
): string => stop.label ?? `${stop.value}${unit ? ` ${unit}` : ''}`

/** One entry per layer, in layer order. */
export function legendEntries(layers: readonly OverlayLayer[]): LegendEntry[] {
  return layers.map((layer): LegendEntry => {
    const base = {
      layerId: layer.id,
      label: layer.legend.label,
      ...(layer.legend.note ? { note: layer.legend.note } : {}),
      kind: layer.kind,
      swatch: SWATCH[layer.kind],
    }
    if (layer.kind === 'raster')
      return {
        ...base,
        unit: layer.colorScale.unit,
        items: layer.colorScale.stops.map((s) => ({
          label: stopLabel(s, layer.colorScale.unit),
          color: s.color,
          dash: [],
          hatch: 'none' as const,
        })),
      }
    return { ...base, items: tokenItems(layer) }
  })
}
