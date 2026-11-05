// pharmacy_recall_trace (spec 0463 FR-5): a recall tracing diagram, lot to the places that hold
// it to the patients who received it. Quantities are words and numbers in boxes with arrows, so
// the diagram reads without color. The figure id is stable so it can later move to a supply chain
// toolkit unchanged (spec 0463, open question on the supply chain order).
import { z } from 'zod'
import { fmt, frame, heading, n, text, wrap } from '../svg'
import { INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'

export const RecallTraceData = z.object({
  title: z.string().max(200).optional(),
  product: z.string().min(1).max(100),
  lots: z
    .array(
      z.object({
        lot: z.string().min(1).max(30),
        received: z.number().int().min(0),
        locations: z
          .array(
            z.object({
              name: z.string().min(1).max(60),
              onHand: z.number().int().min(0),
              dispensed: z.number().int().min(0),
              patients: z.number().int().min(0),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(4),
})
export type RecallTraceData = z.infer<typeof RecallTraceData>

const ROW = 52
const GAP = 10

function renderRecall(d: RecallTraceData, o: { width: number; height: number }): FigureResult {
  const title = d.title ?? `${d.product}: recall trace`
  const lotX = 12
  const lotW = 150
  const locX = lotX + lotW + 56
  const locW = Math.min(250, (o.width - locX - 56 - 150) | 0)
  const patX = locX + locW + 56
  const patW = o.width - patX - 12
  let y = d.title ? 44 : 20
  let body = heading(title, 12)
  body += text(lotX, y - 8, 'Lot', { size: 11, weight: 700, fill: MUTED })
  body += text(locX, y - 8, 'Where it is', { size: 11, weight: 700, fill: MUTED })
  body += text(patX, y - 8, 'Patients', { size: 11, weight: 700, fill: MUTED })
  const markerId = 'rt-arrow'
  const defs = `<marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${INK}"/></marker>`
  for (const lot of d.lots) {
    const h = lot.locations.length * (ROW + GAP) - GAP
    const lotY = y + h / 2 - 28
    body += `<rect x="${lotX}" y="${n(lotY)}" width="${lotW}" height="56" fill="#dbe7f7" stroke="#1f5fbf" stroke-width="2"/>`
    body += text(lotX + 8, lotY + 22, `Lot ${lot.lot}`, { size: 13, weight: 700 })
    body += text(lotX + 8, lotY + 42, `${fmt(lot.received)} received`, { size: 12, fill: INK })
    lot.locations.forEach((loc, i) => {
      const ly = y + i * (ROW + GAP)
      body += `<path d="M${lotX + lotW} ${n(lotY + 28)}L${locX - 4} ${n(ly + ROW / 2)}" stroke="${INK}" stroke-width="1.5" fill="none" marker-end="url(#${markerId})"/>`
      body += `<rect x="${locX}" y="${n(ly)}" width="${locW}" height="${ROW}" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>`
      wrap(loc.name, Math.max(10, Math.floor(locW / 7)), 1).forEach(
        (ln) => (body += text(locX + 8, ly + 20, ln, { size: 12, weight: 700 })),
      )
      body += text(
        locX + 8,
        ly + 40,
        `On hand ${fmt(loc.onHand)} · dispensed ${fmt(loc.dispensed)}`,
        { size: 11, fill: MUTED },
      )
      body += `<path d="M${locX + locW} ${n(ly + ROW / 2)}L${patX - 4} ${n(ly + ROW / 2)}" stroke="${INK}" stroke-width="1.5" fill="none" marker-end="url(#${markerId})"/>`
      const contact = loc.patients > 0
      body += `<rect x="${patX}" y="${n(ly)}" width="${patW}" height="${ROW}" fill="${contact ? '#fff0c2' : '#ffffff'}" stroke="${contact ? '#8a5a00' : '#594c3c'}" stroke-width="2"${contact ? '' : ' stroke-dasharray="4 3"'}/>`
      body += text(
        patX + 8,
        ly + 22,
        contact ? `${fmt(loc.patients)} to contact` : 'None to contact',
        { size: 12, weight: 700 },
      )
      body += text(patX + 8, ly + 40, contact ? 'Trace by lot' : 'Nothing dispensed', {
        size: 11,
        fill: MUTED,
      })
    })
    y += h + 26
  }
  const height = y + 4
  const totalPatients = d.lots.reduce(
    (a, l) => a + l.locations.reduce((b, x) => b + x.patients, 0),
    0,
  )
  const totalOnHand = d.lots.reduce((a, l) => a + l.locations.reduce((b, x) => b + x.onHand, 0), 0)
  const totalDispensed = d.lots.reduce(
    (a, l) => a + l.locations.reduce((b, x) => b + x.dispensed, 0),
    0,
  )
  const summary =
    `${title}: ${d.lots.length} lot${d.lots.length > 1 ? 's' : ''} traced to ${d.lots.reduce((a, l) => a + l.locations.length, 0)} places. ` +
    `${fmt(totalOnHand)} units are on hand to quarantine, ${fmt(totalDispensed)} were dispensed and ${fmt(totalPatients)} patients are to be contacted. ` +
    d.lots.map((l) => `Lot ${l.lot}: ${fmt(l.received)} received.`).join(' ') +
    ' Fictional lots.'
  return {
    svg: frame({ width: o.width, height, title, summary, defs, body, idKey: JSON.stringify(d) }),
    summary,
    table: {
      caption: `${d.product}: recall trace`,
      columns: ['Lot', 'Place', 'On hand', 'Dispensed', 'Patients to contact'],
      rows: d.lots.flatMap((l) =>
        l.locations.map((x) => [l.lot, x.name, fmt(x.onHand), fmt(x.dispensed), fmt(x.patients)]),
      ),
    },
  }
}

export const recallTraceKind: FigureKind<RecallTraceData> = {
  kind: 'pharmacy_recall_trace',
  schema: RecallTraceData,
  render: renderRecall,
  defaultHeight: 380,
}
