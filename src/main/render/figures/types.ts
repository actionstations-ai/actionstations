// Figure kinds (spec 0448 FR-4..FR-6, ADR-0075): pure functions from data to an SVG, a text
// summary and, for charts, a data table. A kind is app code; packs and toolkits only supply data.
import type { z } from 'zod'

/** A data table that sits beside a chart: the same numbers as text, for screen readers and print. */
export interface FigureTable {
  caption?: string
  columns: string[]
  rows: string[][]
}

/** What a kind returns. `summary` is the alt text and the screen-reader packet text. */
export interface FigureResult {
  svg: string
  summary: string
  table?: FigureTable
}

/** Layout options every kind accepts (CSS pixels). */
export interface FigureOptions {
  width: number
  height: number
}

export const DEFAULT_WIDTH = 760
export const DEFAULT_HEIGHT = 380

export interface FigureKind<D = unknown> {
  kind: string
  /** Validates `data`; a failure is reported with the kind and path. */
  schema: z.ZodType<D>
  /** Pure: the same data and options give byte-identical output. */
  render: (data: D, options: FigureOptions) => FigureResult
  /** Height used when the caller gives none (kinds that size to content may ignore the options). */
  defaultHeight?: number
}

/** A figure as stored in an inject's fields (`fields.figures.<name>`). */
export interface FigureSpec {
  kind: string
  data: unknown
  options?: Partial<FigureOptions>
}
