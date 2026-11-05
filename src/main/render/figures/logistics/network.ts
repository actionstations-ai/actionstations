// logistics_supplier_network (spec 0462 FR-5): the supply network in columns by tier, tier 3 on the
// left and the company on the right, with each supplier joined to the party it supplies. A node's
// status is a shape and a word under its name (operating circle, degraded triangle, down square
// with a cross, unknown ring), never color alone.
import { z } from 'zod'
import { AXIS, INK, MUTED, STATUS_STYLES, type StatusState } from '../theme'
import { esc, frame, heading, n, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const STATES = ['operating', 'degraded', 'down', 'unknown'] as const
const THEME: Record<(typeof STATES)[number], StatusState> = {
  operating: 'ok',
  degraded: 'degraded',
  down: 'down',
  unknown: 'unknown',
}
const WORD: Record<(typeof STATES)[number], string> = {
  operating: 'Operating',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
}

export const SupplierNetworkData = z
  .object({
    title: z.string().max(200).optional(),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(30),
          label: z.string().min(1).max(40),
          /** 0 is the company, 1 to 3 are supplier tiers. */
          tier: z.number().int().min(0).max(3),
          status: z.enum(STATES),
        }),
      )
      .min(2)
      .max(60),
    /** `from` supplies `to`. */
    edges: z
      .array(z.object({ from: z.string(), to: z.string() }))
      .max(150)
      .default([]),
    simulated: z.boolean().default(true),
  })
  .refine((d) => new Set(d.nodes.map((x) => x.id)).size === d.nodes.length, {
    message: 'node ids must be unique',
  })
  .refine(
    (d) => {
      const ids = new Set(d.nodes.map((x) => x.id))
      return d.edges.every((e) => ids.has(e.from) && ids.has(e.to))
    },
    { message: 'every edge must join two listed nodes' },
  )
export type SupplierNetworkData = z.infer<typeof SupplierNetworkData>

function shape(status: (typeof STATES)[number], x: number, y: number): string {
  const s = STATUS_STYLES[THEME[status]]
  switch (status) {
    case 'degraded':
      return `<path d="M${n(x)} ${n(y - 10)}L${n(x + 10)} ${n(y + 8)}L${n(x - 10)} ${n(y + 8)}Z" fill="${s.color}" stroke="#ffffff" stroke-width="1.5"/>`
    case 'down':
      return (
        `<rect x="${n(x - 9)}" y="${n(y - 9)}" width="18" height="18" fill="${s.color}" stroke="#ffffff" stroke-width="1.5"/>` +
        `<path d="M${n(x - 5)} ${n(y - 5)}L${n(x + 5)} ${n(y + 5)}M${n(x + 5)} ${n(y - 5)}L${n(x - 5)} ${n(y + 5)}" stroke="#ffffff" stroke-width="2"/>`
      )
    case 'unknown':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="8" fill="#ffffff" stroke="${s.color}" stroke-width="2.5"/>`
    default:
      return `<circle cx="${n(x)}" cy="${n(y)}" r="9" fill="${s.color}" stroke="#ffffff" stroke-width="1.5"/>`
  }
}

const M = { left: 70, right: 70 }

function render(d: SupplierNetworkData, o: { width: number; height: number }): FigureResult {
  const tiers = [...new Set(d.nodes.map((x) => x.tier))].sort((a, b) => b - a)
  const byTier = new Map(
    tiers.map((t) => [
      t,
      d.nodes.filter((x) => x.tier === t).sort((a, b) => a.id.localeCompare(b.id)),
    ]),
  )
  const rows = Math.max(...tiers.map((t) => byTier.get(t)!.length))
  const rowH = 64
  const top = (d.title ? 40 : 14) + 22
  const plotH = Math.max(rows * rowH, 120)
  const legendTop = top + plotH + 18
  const height = legendTop + 30
  const colW = tiers.length > 1 ? (o.width - M.left - M.right) / (tiers.length - 1) : 0
  const pos = new Map<string, { x: number; y: number }>()
  tiers.forEach((t, ti) => {
    const list = byTier.get(t)!
    list.forEach((nd, i) =>
      pos.set(nd.id, {
        x: tiers.length > 1 ? M.left + colW * ti : o.width / 2,
        y: top + ((i + 0.5) * plotH) / list.length,
      }),
    )
  })
  let body = heading(d.title, 16)
  tiers.forEach((t, ti) => {
    body += text(
      tiers.length > 1 ? M.left + colW * ti : o.width / 2,
      top - 8,
      t === 0 ? 'Company' : `Tier ${t}`,
      {
        size: 11.5,
        weight: 700,
        anchor: 'middle',
        fill: MUTED,
      },
    )
  })
  for (const e of d.edges) {
    const a = pos.get(e.from)!
    const b = pos.get(e.to)!
    body += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${AXIS}" stroke-width="1.2" stroke-opacity="0.5"/>`
  }
  for (const nd of d.nodes) {
    const p = pos.get(nd.id)!
    body += shape(nd.status, p.x, p.y)
    const lines = wrap(nd.label, 16, 2)
    lines.forEach((ln, k) => {
      body += text(p.x, p.y + 24 + k * 12, ln, { size: 10.5, anchor: 'middle' })
    })
    body += text(p.x, p.y + 24 + lines.length * 12, WORD[nd.status].toUpperCase(), {
      size: 9.5,
      weight: 700,
      anchor: 'middle',
      fill: STATUS_STYLES[THEME[nd.status]].color,
    })
  }
  let lx = 16
  for (const s of STATES) {
    const used = d.nodes.filter((x) => x.status === s).length
    if (!used) continue
    const label = `${WORD[s]} (${used})`
    body +=
      shape(s, lx + 10, legendTop + 6) +
      text(lx + 26, legendTop + 10, label, { size: 11.5, fill: INK })
    lx += 50 + label.length * 6.4
  }
  const count = (s: (typeof STATES)[number]): number => d.nodes.filter((x) => x.status === s).length
  const suppliers = d.nodes.filter((x) => x.tier > 0)
  const down = suppliers.filter((x) => x.status === 'down').map((x) => x.label)
  const note = d.simulated ? ' Simulated network. All companies are fictional.' : ''
  const summary =
    `${d.title ?? 'Supplier network'}: ${suppliers.length} suppliers over ${tiers.filter((t) => t > 0).length} tiers. ` +
    STATES.filter((s) => count(s) > 0)
      .map((s) => `${count(s)} ${WORD[s].toLowerCase()}`)
      .join(', ') +
    `.${down.length ? ` Down: ${down.join(', ')}.` : ''}${note}`
  const supplies = new Map<string, string[]>()
  const label = new Map(d.nodes.map((x) => [x.id, x.label]))
  for (const e of d.edges) supplies.set(e.from, [...(supplies.get(e.from) ?? []), label.get(e.to)!])
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Supplier network',
      summary,
      body,
      idKey: esc(JSON.stringify(d)),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Party', 'Tier', 'Status', 'Supplies'],
      rows: d.nodes.map((x) => [
        x.label,
        x.tier === 0 ? 'Company' : String(x.tier),
        WORD[x.status],
        (supplies.get(x.id) ?? []).join(', '),
      ]),
    },
  }
}

export const logisticsSupplierNetworkKind: FigureKind<SupplierNetworkData> = {
  kind: 'logistics_supplier_network',
  schema: SupplierNetworkData,
  render,
}
