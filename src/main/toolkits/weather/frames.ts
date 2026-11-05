// Figure frames as case data (ADR-0095): a features dataset whose features carry no geometry and
// hold, in `properties.data`, the data of one figure for the interval `start` to `end` (a radar
// scan, a sounding). An inject's figure points at the dataset (`{ dataset }` as the figure's
// data); the render picks the frame active at the inject's case time and draws it.
import type { CaseDataset } from '@shared/schemas/case-data'

export interface FigureFrame {
  name: string
  /** ISO times; the frame is shown from `start` until `end`. */
  start: string
  end: string
  data: unknown
}

export const frameCollection = (frames: readonly FigureFrame[]): string =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: frames.map((f) => ({
      type: 'Feature',
      geometry: null,
      properties: { name: f.name, start: f.start, end: f.end, data: f.data },
    })),
  })

/** The frames' intervals chained: each ends where the next starts, the last at `lastEnd`. */
export function chainFrames<T extends { start: string }>(
  frames: readonly T[],
  lastEnd: string,
): (T & { end: string })[] {
  const sorted = [...frames].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.map((f, i) => ({ ...f, end: sorted[i + 1]?.start ?? lastEnd }))
}

export type DatasetSeed = Omit<CaseDataset, 'provenance' | 'bytes'>
