// structures_status_board: the inspection program's board (spec 0471 FR-5): every building in its
// area as a cell with its placard written in words and a shape, the counts by placard at the top,
// the priority buildings (hospitals, shelters, schools) still not evaluated named in the
// summary, and the evaluation teams with their assignments and progress. The board sizes itself
// to its content; above 60 buildings the cells shrink to an id and a shape, and the data table
// carries every building.
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { frame, heading, n, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import {
  PLACARD_STATES,
  PLACARD_STYLE,
  PRIORITY_LABEL,
  PlacardState,
  Priority,
  countStates,
  countsSentence,
  isoTime,
  placardSymbol,
  stamp,
  stateAt,
} from './common'

const Building = z.object({
  id: z.string().min(1).max(30),
  name: z.string().max(60).default(''),
  priority: Priority.default('other'),
  placard: PlacardState.default('NOT YET EVALUATED'),
  team: z.string().max(30).optional(),
  postedAt: isoTime.optional(),
})

export const StructuresStatusBoardData = z
  .object({
    title: z.string().max(200).optional(),
    asOf: isoTime.optional(),
    areas: z
      .array(
        z.object({ name: z.string().min(1).max(60), buildings: z.array(Building).min(1).max(150) }),
      )
      .min(1)
      .max(20),
    teams: z
      .array(
        z
          .object({
            name: z.string().min(1).max(30),
            evaluators: z.number().int().min(1).max(20),
            assigned: z.number().int().min(0).max(1000),
            done: z.number().int().min(0).max(1000),
          })
          .refine((t) => t.done <= t.assigned, { message: 'done cannot exceed assigned' }),
      )
      .max(30)
      .default([]),
  })
  .refine((d) => d.areas.reduce((s, a) => s + a.buildings.length, 0) <= 300, {
    message: 'a board shows at most 300 buildings',
  })
export type StructuresStatusBoardData = z.infer<typeof StructuresStatusBoardData>

function render(d: StructuresStatusBoardData, o: { width: number; height: number }): FigureResult {
  const rows = d.areas.flatMap((a) =>
    a.buildings.map((b) => ({ area: a.name, b, state: stateAt(b.placard, b.postedAt, d.asOf) })),
  )
  const total = rows.length
  const compact = total > 60
  const counts = countStates(rows.map((r) => r.state))
  const pad = 16
  const cellW = compact ? 74 : 168
  const cellH = compact ? 30 : 58
  const gap = 6
  const perRow = Math.max(1, Math.floor((o.width - 2 * pad + gap) / (cellW + gap)))
  let y = 34
  let body = heading(d.title, pad)
  if (d.asOf)
    body += text(o.width - pad, 20, `As of ${stamp(d.asOf)}`, {
      size: 12,
      anchor: 'end',
      fill: MUTED,
    })

  // Counts.
  const boxW = Math.floor((o.width - 2 * pad - 3 * gap) / 4)
  PLACARD_STATES.forEach((s, i) => {
    const st = PLACARD_STYLE[s]
    const x = pad + i * (boxW + gap)
    body += `<rect x="${n(x)}" y="${n(y)}" width="${boxW}" height="50" fill="${st.tint}" stroke="${st.color}" stroke-width="2"/>`
    body += placardSymbol(s, x + 20, y + 25)
    body += text(x + 38, y + 22, String(counts[s]), { size: 20, weight: 700, fill: st.color })
    body += text(x + 38, y + 40, s, { size: 11, weight: 700, fill: INK })
  })
  y += 50 + 18

  // Areas.
  for (const a of d.areas) {
    const items = rows.filter((r) => r.area === a.name)
    body += text(pad, y, `${a.name} (${items.length})`, { size: 13, weight: 700 })
    y += 8
    items.forEach((r, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const x = pad + col * (cellW + gap)
      const cy = y + row * (cellH + gap)
      const st = PLACARD_STYLE[r.state]
      body += `<rect x="${n(x)}" y="${n(cy)}" width="${cellW}" height="${cellH}" fill="${st.tint}" stroke="${st.color}" stroke-width="${r.b.priority === 'other' ? 1.5 : 3}"/>`
      body += placardSymbol(r.state, x + 14, cy + cellH / 2, compact ? 6 : 7)
      if (compact) {
        body += text(x + 26, cy + cellH / 2 + 4, r.b.id, { size: 11, weight: 600 })
      } else {
        body += text(x + 28, cy + 17, r.b.id, { size: 12, weight: 700 })
        const nm = wrap(r.b.name || PRIORITY_LABEL[r.b.priority], 22, 1)[0] ?? ''
        body += text(x + 28, cy + 31, nm, { size: 11, fill: INK })
        body += text(x + 8, cy + 48, r.state, { size: 11, weight: 700, fill: st.color })
        if (r.b.priority !== 'other')
          body += text(x + cellW - 6, cy + 17, r.b.priority.toUpperCase(), {
            size: 9,
            weight: 700,
            anchor: 'end',
            fill: MUTED,
          })
      }
    })
    y += Math.ceil(items.length / perRow) * (cellH + gap) + 14
  }

  // Teams.
  if (d.teams.length) {
    body += text(pad, y, 'Evaluation teams', { size: 13, weight: 700 })
    y += 8
    for (const t of d.teams) {
      const barW = 200
      body += text(pad, y + 18, `${t.name}: ${t.evaluators} evaluators`, { size: 12 })
      body += `<rect x="${n(o.width - pad - barW - 90)}" y="${n(y + 6)}" width="${barW}" height="14" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>`
      const frac = t.assigned ? t.done / t.assigned : 0
      body += `<rect x="${n(o.width - pad - barW - 90)}" y="${n(y + 6)}" width="${n(barW * frac)}" height="14" fill="#1f5fbf"/>`
      body += text(o.width - pad, y + 18, `${t.done} of ${t.assigned} done`, {
        size: 12,
        anchor: 'end',
      })
      y += 26
    }
    y += 4
  }

  const pending = rows.filter((r) => r.state === 'NOT YET EVALUATED' && r.b.priority !== 'other')
  const summary =
    `${d.title ?? 'Inspection status board'}${d.asOf ? ` as of ${stamp(d.asOf)}` : ''}: ${total} buildings in ${d.areas.length} areas: ${countsSentence(counts)}. ` +
    (pending.length
      ? `Priority buildings not yet evaluated: ${pending
          .map((r) => `${r.b.id} (${PRIORITY_LABEL[r.b.priority]})`)
          .join(', ')}. `
      : 'Every priority building has been evaluated. ') +
    (d.teams.length
      ? `Teams: ${d.teams.map((t) => `${t.name} ${t.done} of ${t.assigned} done with ${t.evaluators} evaluators`).join('; ')}.`
      : '')
  return {
    svg: frame({
      width: o.width,
      height: Math.ceil(y + 6),
      title: d.title ?? 'Inspection status board',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Building', 'Area', 'Priority', 'Placard', 'Team', 'Posted'],
      rows: rows.map((r) => [
        r.b.id + (r.b.name ? ` ${r.b.name}` : ''),
        r.area,
        PRIORITY_LABEL[r.b.priority],
        r.state,
        r.b.team ?? '',
        r.state === 'NOT YET EVALUATED' || !r.b.postedAt ? '' : stamp(r.b.postedAt),
      ]),
    },
  }
}

export const structuresStatusBoardKind: FigureKind<StructuresStatusBoardData> = {
  kind: 'structures_status_board',
  schema: StructuresStatusBoardData,
  render,
}
