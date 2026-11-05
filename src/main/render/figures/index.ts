// Figures (spec 0448 FR-4..FR-6, ADR-0075). Importing this module registers the generic kinds;
// other modules add theirs with registerFigureKind. `computeFigures` builds the template
// context's `figures` from an inject's `fields.figures`, beside `derived` (render/derived).
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { annotatedTimelineKind } from './annotated-timeline'
import './animal'
import './epi'
import './hs'
import './ems'
import './hazmat'
import { barKind, stackedBarKind } from './bar'
// Field kinds register themselves on import (one line per field).
import './clinical'
import { gaugeKind } from './gauge'
import './geo'
import './governance'
// Field kinds register themselves when imported (media environment).
import './media'
import { FigureOutput, registerFigureKind, renderFigure } from './registry'
import { statusBoardKind } from './status-board'
import { tableKind } from './table'
import { timeSeriesKind } from './time-series'
import './clinical_care'
import './spill'
import './structures'
// Field kinds register themselves when imported (weather).
import './weather'

registerFigureKind(timeSeriesKind)
registerFigureKind(barKind)
registerFigureKind(stackedBarKind)
registerFigureKind(gaugeKind)
registerFigureKind(statusBoardKind)
registerFigureKind(tableKind)
registerFigureKind(annotatedTimelineKind)
import './flood'
// Field kinds register themselves when imported (AI incidents).
import './ai'
import './justice'
import './lab'
// Field kinds register themselves when imported (pharmacy).
import './pharmacy'
// Field kinds register themselves when imported (logistics).
import './logistics'
import './space'
// Field kinds register themselves when imported (wildfire).
import './fire'
import './humanitarian'

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

/** What the bridge needs of a resolved case reference. */
export interface CaseValues {
  [path: string]: { value: unknown; label?: string }
}

/**
 * A figure's `data` can be a reference into case data: a dataset of features whose
 * `properties.data` holds the figure's data for the moment the inject shows (a radar frame, a
 * sounding). The render resolves the reference to display text and keeps the value under
 * `figures.<name>.data`; the bridge swaps the text for that data, so the figure is still drawn
 * from validated data and a historical or simulated dataset is the only source.
 */
function figureDataFromCase(
  name: string,
  data: unknown,
  caseData: CaseValues | undefined,
): unknown {
  const resolved = caseData?.[`figures.${name}.data`]
  if (typeof data !== 'string' || !resolved) return data
  const features = Array.isArray(resolved.value) ? resolved.value : []
  const hit = features.find(
    (f) =>
      f &&
      typeof f === 'object' &&
      typeof (f as { properties?: { data?: unknown } }).properties?.data === 'object',
  ) as { properties: { data: unknown } } | undefined
  if (!hit)
    throw new AppError('VALIDATION', `figures.${name}: the case data holds no figure for this time`)
  return hit.properties.data
}

/**
 * `figures.<name>` for a template: each entry of `fields.figures` drawn by its kind. Empty when
 * the inject has none. Invalid specs throw a VALIDATION error naming the figure, so a render
 * never ships a half-drawn chart.
 */
export function computeFigures(
  fields: Record<string, unknown>,
  caseData?: CaseValues,
): Record<string, FigureOutput> {
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
      out[name] = new FigureOutput(
        spec.kind,
        renderFigure({ ...spec, data: figureDataFromCase(name, spec.data, caseData) }),
      )
    } catch (e) {
      if (e instanceof AppError)
        throw new AppError(e.code, `figures.${name}: ${e.message}`, e.details)
      throw e
    }
  }
  return out
}
