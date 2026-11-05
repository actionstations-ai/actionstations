// epi_line_list and epi_attack_rates (spec 0457 FR-5): the two tables an investigation lives in.
// Both are drawn by the generic table kind, so they size to their rows and carry the same data
// table and summary conventions. Line lists use fictional people only: identifiers can be shown
// as codes, as fictional names, or hidden behind row numbers, and every list says it is simulated.
import { z } from 'zod'
import { association, type TwoByTwo } from '@shared/epidemiology/arithmetic'
import { fmt } from '../svg'
import { tableKind } from '../table'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')
const Status = z.enum(['confirmed', 'probable', 'suspect'])

export const EpiLineListData = z.object({
  title: z.string().max(200).optional(),
  rows: z
    .array(
      z.object({
        id: z.string().min(1).max(30),
        /** Fictional name, shown only when identifiers is "names". */
        name: z.string().max(60).optional(),
        age: z.number().int().min(0).max(120).optional(),
        sex: z.enum(['F', 'M', 'U']).optional(),
        onset: isoDate.optional(),
        status: Status,
        setting: z.string().max(80).optional(),
        lab: z.string().max(60).optional(),
      }),
    )
    .min(1)
    .max(500),
  sort: z.enum(['onset', 'id']).default('onset'),
  identifiers: z.enum(['codes', 'names', 'hidden']).default('codes'),
  /** Printed under the table; a replayed or simulated list always says which. */
  simulated: z.boolean().default(true),
})
export type EpiLineListData = z.infer<typeof EpiLineListData>

const MAX_DRAWN = 60
const stamp = (iso: string | undefined): string =>
  iso ? new Date(Date.parse(iso)).toISOString().slice(0, 16).replace('T', ' ') : ''

function renderLineList(d: EpiLineListData, o: FigureOptions): FigureResult {
  const rows = [...d.rows].sort((a, b) =>
    d.sort === 'id'
      ? a.id.localeCompare(b.id)
      : (a.onset ? Date.parse(a.onset) : Infinity) - (b.onset ? Date.parse(b.onset) : Infinity) ||
        a.id.localeCompare(b.id),
  )
  const withNames = d.identifiers === 'names'
  const columns = [
    d.identifiers === 'hidden' ? 'Row' : 'ID',
    ...(withNames ? ['Name'] : []),
    'Age',
    'Sex',
    'Onset (UTC)',
    'Status',
    'Setting',
    'Lab',
  ]
  const cells = rows.map((r, i) => [
    d.identifiers === 'hidden' ? String(i + 1) : r.id,
    ...(withNames ? [r.name ?? ''] : []),
    r.age === undefined ? '' : String(r.age),
    r.sex ?? '',
    stamp(r.onset),
    r.status,
    r.setting ?? '',
    r.lab ?? '',
  ])
  const note = d.simulated ? 'Simulated line list. All people are fictional.' : undefined
  const caption =
    [rows.length > MAX_DRAWN ? `Showing ${MAX_DRAWN} of ${rows.length} rows.` : undefined, note]
      .filter(Boolean)
      .join(' ') || undefined
  const drawn = tableKind.render(
    {
      title: d.title ?? 'Line list',
      ...(caption ? { caption } : {}),
      columns,
      rows: cells.slice(0, MAX_DRAWN),
    },
    o,
  )
  const tally = { confirmed: 0, probable: 0, suspect: 0 }
  for (const r of rows) tally[r.status]++
  const onsets = rows.filter((r) => r.onset).map((r) => Date.parse(r.onset!))
  const span = onsets.length
    ? ` Onsets from ${stamp(new Date(Math.min(...onsets)).toISOString())} to ${stamp(new Date(Math.max(...onsets)).toISOString())} UTC.`
    : ''
  const summary =
    `${d.title ?? 'Line list'}: ${rows.length} cases (${tally.confirmed} confirmed, ${tally.probable} probable, ` +
    `${tally.suspect} suspect), sorted by ${d.sort}.${span}${note ? ` ${note}` : ''}` +
    (d.identifiers === 'hidden' ? ' Identifiers are hidden.' : '')
  return {
    svg: drawn.svg,
    summary,
    table: { caption: d.title ?? 'Line list', columns, rows: cells },
  }
}

export const epiLineListKind: FigureKind<EpiLineListData> = {
  kind: 'epi_line_list',
  schema: EpiLineListData,
  render: renderLineList,
}

// ---- attack rates -----------------------------------------------------------------------------

export const EpiAttackRatesData = z.object({
  title: z.string().max(200).optional(),
  /** Ill and well people by whether they ate (or were exposed to) each item. */
  exposures: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        illExposed: z.number().int().min(0).max(100_000),
        wellExposed: z.number().int().min(0).max(100_000),
        illUnexposed: z.number().int().min(0).max(100_000),
        wellUnexposed: z.number().int().min(0).max(100_000),
      }),
    )
    .min(1)
    .max(30),
})
export type EpiAttackRatesData = z.infer<typeof EpiAttackRatesData>

const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(0)}%`)
const ratio = (v: number | null): string => (v === null ? 'n/a' : v >= 100 ? '>100' : v.toFixed(1))

function renderAttackRates(d: EpiAttackRatesData, o: FigureOptions): FigureResult {
  const computed = d.exposures.map((e) => {
    const t: TwoByTwo = { a: e.illExposed, b: e.wellExposed, c: e.illUnexposed, d: e.wellUnexposed }
    return { e, t, a: association(t) }
  })
  const best = computed.reduce<(typeof computed)[number] | undefined>(
    (b, c) => ((c.a.oddsRatio ?? -1) > (b?.a.oddsRatio ?? -1) ? c : b),
    undefined,
  )
  const columns = [
    'Exposure',
    'Exposed ill / total',
    'Attack rate',
    'Unexposed ill / total',
    'Attack rate',
    'Relative risk',
    'Odds ratio (95% CI)',
  ]
  const rows = computed.map(({ e, t, a }) => [
    e.name + (best && a.oddsRatio !== null && a === best.a ? ' (highest odds ratio)' : ''),
    `${t.a} / ${t.a + t.b}`,
    pct(a.attackRateExposed),
    `${t.c} / ${t.c + t.d}`,
    pct(a.attackRateUnexposed),
    ratio(a.relativeRisk),
    a.oddsRatio === null
      ? 'n/a'
      : `${ratio(a.oddsRatio)} (${ratio(a.oddsRatioCi![0])} to ${ratio(a.oddsRatioCi![1])})`,
  ])
  const drawn = tableKind.render(
    {
      title: d.title ?? 'Attack rates by exposure',
      caption:
        'Attack rate = ill / total in the group. A zero cell adds 0.5 to every cell of the odds ratio.',
      columns,
      rows,
    },
    o,
  )
  const summary =
    `${d.title ?? 'Attack rates by exposure'}: ${d.exposures.length} exposures compared. ` +
    (best && best.a.oddsRatio !== null
      ? `Highest odds ratio: ${best.e.name}, ${fmt(best.a.oddsRatio)}, attack rate ${pct(best.a.attackRateExposed)} among the exposed against ${pct(best.a.attackRateUnexposed)} among the unexposed. `
      : '') +
    computed
      .map(
        ({ e, a }) =>
          `${e.name}: odds ratio ${ratio(a.oddsRatio)}, attack rate ${pct(a.attackRateExposed)} exposed`,
      )
      .join('; ') +
    '.'
  return { svg: drawn.svg, summary, table: { caption: d.title, columns, rows } }
}

export const epiAttackRatesKind: FigureKind<EpiAttackRatesData> = {
  kind: 'epi_attack_rates',
  schema: EpiAttackRatesData,
  render: renderAttackRates,
}
