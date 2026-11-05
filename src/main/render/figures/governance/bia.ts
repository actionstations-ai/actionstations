// gov_bia_table (spec 0459 FR-5): the business impact analysis as a table, one row per critical
// function with its recovery objectives and impact over time. Drawn by the generic table kind, so
// it sizes to its rows. RTOs and RPOs are the designer's numbers; the figure does not grade them.
import { z } from 'zod'
import { tableKind } from '../table'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

export const IMPACT_GRADES = ['Low', 'Medium', 'High', 'Severe'] as const
const Grade = z.enum(IMPACT_GRADES)

export const GovBiaData = z
  .object({
    title: z.string().max(200).optional(),
    asOf: z.string().max(80).optional(),
    functions: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          owner: z.string().max(80).optional(),
          rtoHours: z.number().min(0).max(8760),
          rpoHours: z.number().min(0).max(8760).optional(),
          impact: z.object({ h4: Grade, h24: Grade, h72: Grade }),
          dependencies: z.array(z.string().min(1).max(60)).max(8).default([]),
        }),
      )
      .min(1)
      .max(40),
  })
  .refine((d) => new Set(d.functions.map((f) => f.name)).size === d.functions.length, {
    message: 'function names must be unique',
  })
export type GovBiaData = z.infer<typeof GovBiaData>

const COLUMNS = ['Function', 'Owner', 'RTO / RPO (h)', 'Impact at 4 / 24 / 72 h', 'Dependencies']

function render(d: GovBiaData, o: FigureOptions): FigureResult {
  const title = d.title ?? 'Business impact analysis'
  const rows = d.functions.map((f) => [
    f.name,
    f.owner ?? '',
    `${f.rtoHours} / ${f.rpoHours ?? 'n/a'}`,
    `${f.impact.h4} / ${f.impact.h24} / ${f.impact.h72}`,
    f.dependencies.join('; '),
  ])
  const drawn = tableKind.render(
    {
      title,
      caption: `${d.asOf ? `${d.asOf}. ` : ''}The impact column gives the grade after 4, 24 and 72 hours: Low, Medium, High or Severe.`,
      columns: COLUMNS,
      rows,
    },
    o,
  )
  const shortest = d.functions.reduce((a, b) => (b.rtoHours < a.rtoHours ? b : a))
  const severe = d.functions.filter((f) => f.impact.h72 === 'Severe').map((f) => f.name)
  const summary =
    `${title}${d.asOf ? ` (${d.asOf})` : ''}: ${d.functions.length} critical functions. ` +
    `Shortest recovery time objective: ${shortest.name}, ${shortest.rtoHours} hours. ` +
    (severe.length
      ? `Severe impact by 72 hours: ${severe.join(', ')}. `
      : 'No function reaches severe impact by 72 hours. ') +
    d.functions
      .map(
        (f) =>
          `${f.name}: RTO ${f.rtoHours} h, impact ${f.impact.h4} at 4 h, ${f.impact.h24} at 24 h, ${f.impact.h72} at 72 h`,
      )
      .join('; ') +
    '.'
  return { svg: drawn.svg, summary, table: { caption: title, columns: COLUMNS, rows } }
}

export const govBiaKind: FigureKind<GovBiaData> = {
  kind: 'gov_bia_table',
  schema: GovBiaData,
  render,
}
