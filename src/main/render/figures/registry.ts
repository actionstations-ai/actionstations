// The figure kind registry. Kinds are keyed by id; other modules add their own (the map kind of
// #652, field kinds from toolkits) by calling registerFigureKind at load time. A kind is app code;
// packs only supply the data it draws.
import { AppError } from '../../lib/errors'
import { esc } from './svg'
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  type FigureKind,
  type FigureOptions,
  type FigureResult,
  type FigureSpec,
  type FigureTable,
} from './types'

const kinds = new Map<string, FigureKind<never>>()

/** Add a kind. Registering the same kind object twice is a no-op; a different one under a taken id throws. */
export function registerFigureKind<D>(kind: FigureKind<D>): void {
  const existing = kinds.get(kind.kind)
  if (existing && existing !== (kind as unknown as FigureKind<never>))
    throw new Error(`Figure kind "${kind.kind}" is already registered`)
  kinds.set(kind.kind, kind as unknown as FigureKind<never>)
}

export const getFigureKind = (id: string): FigureKind<unknown> | undefined =>
  kinds.get(id) as unknown as FigureKind<unknown> | undefined

export const listFigureKinds = (): string[] => [...kinds.keys()].sort()

/** The data table as an accessible HTML table (caption, column headers, row headers). */
export function tableHtml(t: FigureTable): string {
  const head = t.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')
  const rows = t.rows
    .map(
      (r) =>
        '<tr>' +
        r
          .map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`))
          .join('') +
        '</tr>',
    )
    .join('')
  return (
    `<table class="fig-table">${t.caption ? `<caption>${esc(t.caption)}</caption>` : ''}` +
    `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
  )
}

/**
 * What a template gets for `figures.<name>`: printing it ({{{figures.radar}}}) gives the SVG;
 * `.summary` is the alt text, `.table` the data and `.tableHtml` the table as HTML.
 */
export class FigureOutput {
  readonly kind: string
  readonly svg: string
  readonly summary: string
  readonly table: FigureTable | undefined
  readonly tableHtml: string

  constructor(kind: string, result: FigureResult) {
    this.kind = kind
    this.svg = result.svg
    this.summary = result.summary
    this.table = result.table
    this.tableHtml = result.table ? tableHtml(result.table) : ''
  }

  toString(): string {
    return this.svg
  }
}

function sizeOptions(kind: FigureKind<unknown>, given: FigureSpec['options']): FigureOptions {
  const clamp = (v: number | undefined, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(2000, Math.max(200, Math.round(v)))
      : fallback
  return {
    width: clamp(given?.width, DEFAULT_WIDTH),
    height: clamp(given?.height, kind.defaultHeight ?? DEFAULT_HEIGHT),
  }
}

/** Validate a spec against its kind and draw it. Unknown kinds and bad data are VALIDATION errors. */
export function renderFigure(spec: FigureSpec): FigureResult {
  const kind = getFigureKind(spec.kind)
  if (!kind)
    throw new AppError(
      'VALIDATION',
      `Unknown figure kind "${spec.kind}". Known kinds: ${listFigureKinds().join(', ')}`,
    )
  const parsed = kind.schema.safeParse(spec.data)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'data'}: ${i.message}`)
      .join('; ')
    throw new AppError('VALIDATION', `Figure "${spec.kind}" data is not valid: ${issues}`)
  }
  return kind.render(parsed.data, sizeOptions(kind, spec.options))
}
