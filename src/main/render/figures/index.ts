// Figures (spec 0448 FR-4..FR-6, ADR-0075). Importing this module registers the generic kinds;
// other modules add theirs with registerFigureKind. `computeFigures` builds the template
// context's `figures` from an inject's `fields.figures`, beside `derived` (render/derived).
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { annotatedTimelineKind } from './annotated-timeline'
import { barKind, stackedBarKind } from './bar'
// Field kinds register themselves on import (one line per field).
import './clinical'
import { gaugeKind } from './gauge'
import { FigureOutput, registerFigureKind, renderFigure } from './registry'
import { statusBoardKind } from './status-board'
import { tableKind } from './table'
import { timeSeriesKind } from './time-series'

registerFigureKind(timeSeriesKind)
registerFigureKind(barKind)
registerFigureKind(stackedBarKind)
registerFigureKind(gaugeKind)
registerFigureKind(statusBoardKind)
registerFigureKind(tableKind)
registerFigureKind(annotatedTimelineKind)

export {
  FigureOutput,
  getFigureKind,
  listFigureKinds,
  registerFigureKind,
  renderFigure,
  tableHtml,
} from './registry'
export type { FigureKind, FigureOptions, FigureResult, FigureSpec, FigureTable } from './types'

const FigureSpecSchema = z.object({
  kind: z.string().min(1).max(60),
  data: z.unknown(),
  options: z.object({ width: z.number().optional(), height: z.number().optional() }).optional(),
})

const FiguresField = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), FigureSpecSchema)

const MAX_FIGURES = 12

/**
 * `figures.<name>` for a template: each entry of `fields.figures` drawn by its kind. Empty when
 * the inject has none. Invalid specs throw a VALIDATION error naming the figure, so a render
 * never ships a half-drawn chart.
 */
export function computeFigures(fields: Record<string, unknown>): Record<string, FigureOutput> {
  const raw = fields.figures
  if (raw === undefined || raw === null) return {}
  const parsed = FiguresField.safeParse(raw)
  if (!parsed.success)
    throw new AppError(
      'VALIDATION',
      `fields.figures is not valid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    )
  const entries = Object.entries(parsed.data)
  if (entries.length > MAX_FIGURES)
    throw new AppError('VALIDATION', `An inject can carry at most ${MAX_FIGURES} figures`)
  const out: Record<string, FigureOutput> = {}
  for (const [name, spec] of entries) {
    try {
      out[name] = new FigureOutput(spec.kind, renderFigure(spec))
    } catch (e) {
      if (e instanceof AppError)
        throw new AppError(e.code, `figures.${name}: ${e.message}`, e.details)
      throw e
    }
  }
  return out
}
