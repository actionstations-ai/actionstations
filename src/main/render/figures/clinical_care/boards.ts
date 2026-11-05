// unit_census and evacuation_progress (spec 0452 FR-5): the unit bed board and the progress of
// an evacuation. Every state is a word as well as a pattern or symbol.
import { z } from 'zod'
import { frame, heading, n, text, wrap } from '../svg'
import { INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'

const BED_STATES = ['occupied', 'empty', 'isolation', 'blocked'] as const
type BedState = (typeof BED_STATES)[number]

const STATE_STYLE: Record<BedState, { word: string; fill: string; stroke: string; dash?: string }> =
  {
    occupied: { word: 'Occupied', fill: '#dbe7f7', stroke: '#1f5fbf' },
    empty: { word: 'Empty', fill: '#ffffff', stroke: '#594c3c', dash: '4 3' },
    isolation: { word: 'Isolation', fill: '#fff0c2', stroke: '#8a5a00' },
    blocked: { word: 'Blocked', fill: '#e6e6e6', stroke: '#14100c' },
  }

export const UnitCensusData = z.object({
  title: z.string().max(200).optional(),
  unit: z.string().min(1).max(80),
  asOf: z.string().max(40).optional(),
  beds: z
    .array(
      z.object({
        bed: z.string().min(1).max(12),
        state: z.enum(BED_STATES),
        /** Patient initials or a short note; a synthetic patient. */
        note: z.string().max(40).optional(),
        acuity: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(48),
  nursesOnDuty: z.number().int().min(0).optional(),
})
export type UnitCensusData = z.infer<typeof UnitCensusData>

function renderCensus(d: UnitCensusData, o: { width: number; height: number }): FigureResult {
  const cols = Math.max(2, Math.min(6, Math.floor((o.width - 24) / 128)))
  const tileW = (o.width - 24 - (cols - 1) * 8) / cols
  const tileH = 62
  const top = d.title ? 40 : 12
  const counts = Object.fromEntries(
    BED_STATES.map((s) => [s, d.beds.filter((b) => b.state === s).length]),
  ) as Record<BedState, number>
  const rows = Math.ceil(d.beds.length / cols)
  const height = top + rows * (tileH + 8) + 34
  let body = heading(d.title ?? `${d.unit} bed board`, 12)
  d.beds.forEach((b, i) => {
    const s = STATE_STYLE[b.state]
    const x = 12 + (i % cols) * (tileW + 8)
    const y = top + Math.floor(i / cols) * (tileH + 8)
    body += `<rect x="${n(x)}" y="${y}" width="${n(tileW)}" height="${tileH}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`
    body += text(x + 8, y + 18, `Bed ${b.bed}`, { size: 13, weight: 700 })
    body += text(x + 8, y + 36, s.word, { size: 12, weight: 600, fill: INK })
    const note = [b.note, b.acuity].filter(Boolean).join(' · ')
    if (note)
      wrap(note, Math.max(8, Math.floor(tileW / 6.4)), 1).forEach(
        (ln) => (body += text(x + 8, y + 53, ln, { size: 11, fill: MUTED })),
      )
  })
  const occ = counts.occupied + counts.isolation
  const legendLine = `${occ} patients of ${d.beds.length} beds · ${counts.empty} empty · ${counts.isolation} isolation · ${counts.blocked} blocked${d.nursesOnDuty !== undefined ? ` · ${d.nursesOnDuty} nurses on duty` : ''}`
  body += text(12, height - 12, `${legendLine}. Simulated patients.`, { size: 12, fill: MUTED })
  const ratio = d.nursesOnDuty
    ? ` That is ${Math.round((occ / d.nursesOnDuty) * 10) / 10} patients per nurse.`
    : ''
  const summary = `${d.title ?? `${d.unit} bed board`}${d.asOf ? ` as of ${d.asOf}` : ''}: ${legendLine}.${ratio}`
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? `${d.unit} bed board`,
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: `${d.unit} beds`,
      columns: ['Bed', 'State', 'Note'],
      rows: d.beds.map((b) => [
        b.bed,
        STATE_STYLE[b.state].word,
        [b.note, b.acuity].filter(Boolean).join(' · '),
      ]),
    },
  }
}

export const unitCensusKind: FigureKind<UnitCensusData> = {
  kind: 'unit_census',
  schema: UnitCensusData,
  render: renderCensus,
  defaultHeight: 300,
}

// ---------------------------------------------------------------- evacuation progress

export const EvacuationProgressData = z
  .object({
    title: z.string().max(200).optional(),
    unit: z.string().max(80).default('Unit'),
    elapsed: z.string().max(40).optional(),
    groups: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          total: z.number().int().min(1).max(500),
          moved: z.number().int().min(0).max(500),
          note: z.string().max(80).optional(),
        }),
      )
      .min(1)
      .max(12),
  })
  .refine((d) => d.groups.every((g) => g.moved <= g.total), {
    message: 'moved cannot exceed total',
  })
export type EvacuationProgressData = z.infer<typeof EvacuationProgressData>

function renderEvac(d: EvacuationProgressData, o: { width: number; height: number }): FigureResult {
  const top = d.title ? 40 : 12
  const L = 200
  const R = o.width - 150
  let body = heading(d.title ?? `${d.unit} evacuation progress`, 12)
  d.groups.forEach((g, i) => {
    const y = top + i * 40
    const pct = Math.round((g.moved / g.total) * 100)
    body += text(12, y + 18, g.label, { size: 13, weight: 600 })
    body += `<rect x="${L}" y="${y + 4}" width="${R - L}" height="20" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>`
    if (g.moved)
      body += `<rect x="${L}" y="${y + 4}" width="${n(((R - L) * g.moved) / g.total)}" height="20" fill="#1f5fbf"/>`
    body += text(R + 10, y + 19, `${g.moved} of ${g.total} moved (${pct}%)`, {
      size: 12,
      weight: 600,
    })
    if (g.note) body += text(L, y + 36, g.note, { size: 10, fill: MUTED })
  })
  const height = top + d.groups.length * 40 + 30
  const moved = d.groups.reduce((s, g) => s + g.moved, 0)
  const total = d.groups.reduce((s, g) => s + g.total, 0)
  body += text(
    12,
    height - 10,
    `${moved} of ${total} patients moved${d.elapsed ? ` after ${d.elapsed}` : ''}. Simulated patients.`,
    { size: 12, fill: MUTED },
  )
  const summary =
    `${d.title ?? `${d.unit} evacuation progress`}${d.elapsed ? ` after ${d.elapsed}` : ''}: ${moved} of ${total} patients moved. ` +
    d.groups.map((g) => `${g.label} ${g.moved} of ${g.total}`).join('; ') +
    '.'
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? `${d.unit} evacuation progress`,
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: `${d.unit} evacuation`,
      columns: ['Group', 'Moved', 'Total', 'Percent', 'Note'],
      rows: d.groups.map((g) => [
        g.label,
        String(g.moved),
        String(g.total),
        `${Math.round((g.moved / g.total) * 100)}%`,
        g.note ?? '',
      ]),
    },
  }
}

export const evacuationProgressKind: FigureKind<EvacuationProgressData> = {
  kind: 'evacuation_progress',
  schema: EvacuationProgressData,
  render: renderEvac,
  defaultHeight: 300,
}
