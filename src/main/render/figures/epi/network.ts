// epi_contact_network: the contact tracing network (spec 0457 FR-5). Nodes sit in columns by
// generation (the index case, then contacts and cases of each generation) and are joined to the
// person they were exposed by. A node's status shows as a shape, a color and a word in the
// legend, never color alone: index case (diamond), case (filled circle), contact reached
// (ring with a tick), contact pending (dashed square), contact unreachable (triangle with a bar),
// contact cleared (hollow circle).
import { z } from 'zod'
import { AXIS, INK, MUTED } from '../theme'
import { esc, frame, heading, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'

export const CONTACT_STATUSES = [
  'index',
  'case',
  'reached',
  'pending',
  'unreachable',
  'cleared',
] as const
export type ContactNodeStatus = (typeof CONTACT_STATUSES)[number]

const LABEL: Record<ContactNodeStatus, string> = {
  index: 'Index case',
  case: 'Case',
  reached: 'Contact reached',
  pending: 'Contact pending',
  unreachable: 'Contact unreachable',
  cleared: 'Contact cleared',
}
const COLOR: Record<ContactNodeStatus, string> = {
  index: '#14100c',
  case: '#b3121b',
  reached: '#1b7a3a',
  pending: '#8a5a00',
  unreachable: '#6d3fb5',
  cleared: '#1f5fbf',
}

export const EpiContactNetworkData = z
  .object({
    title: z.string().max(200).optional(),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(30),
          label: z.string().max(40).optional(),
          generation: z.number().int().min(0).max(6),
          status: z.enum(CONTACT_STATUSES),
        }),
      )
      .min(1)
      .max(150),
    /** `from` exposed `to`. */
    edges: z
      .array(z.object({ from: z.string(), to: z.string() }))
      .max(300)
      .default([]),
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
export type EpiContactNetworkData = z.infer<typeof EpiContactNetworkData>

/** The node shape centred on (x, y), drawn at radius `r`. */
function shape(status: ContactNodeStatus, x: number, y: number, r: number): string {
  const c = COLOR[status]
  switch (status) {
    case 'index':
      return `<path d="M${n(x)} ${n(y - r - 3)}L${n(x + r + 3)} ${n(y)}L${n(x)} ${n(y + r + 3)}L${n(x - r - 3)} ${n(y)}Z" fill="${c}" stroke="#ffffff" stroke-width="1.5"/>`
    case 'case':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${c}" stroke="#ffffff" stroke-width="1.5"/>`
    case 'reached':
      return (
        `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="#ffffff" stroke="${c}" stroke-width="2.4"/>` +
        `<path d="M${n(x - r / 2)} ${n(y)}L${n(x - r / 6)} ${n(y + r / 2.2)}L${n(x + r / 2)} ${n(y - r / 2)}" fill="none" stroke="${c}" stroke-width="2.2"/>`
      )
    case 'pending':
      return `<rect x="${n(x - r)}" y="${n(y - r)}" width="${2 * r}" height="${2 * r}" fill="#ffffff" stroke="${c}" stroke-width="2.4" stroke-dasharray="3 2"/>`
    case 'unreachable':
      return (
        `<path d="M${n(x)} ${n(y - r - 1)}L${n(x + r + 2)} ${n(y + r)}L${n(x - r - 2)} ${n(y + r)}Z" fill="${c}" stroke="#ffffff" stroke-width="1.2"/>` +
        `<path d="M${n(x - r / 2)} ${n(y + r / 3)}H${n(x + r / 2)}" stroke="#ffffff" stroke-width="2.2"/>`
      )
    case 'cleared':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="#ffffff" stroke="${c}" stroke-width="2"/>`
  }
}

const M = { left: 24, right: 24 }

function render(d: EpiContactNetworkData, o: { width: number; height: number }): FigureResult {
  const gens = [...new Set(d.nodes.map((x) => x.generation))].sort((a, b) => a - b)
  const byGen = new Map(
    gens.map((g) => [
      g,
      d.nodes.filter((x) => x.generation === g).sort((a, b) => a.id.localeCompare(b.id)),
    ]),
  )
  const rows = Math.max(...gens.map((g) => byGen.get(g)!.length))
  const R = rows > 24 ? 6 : 8
  const rowH = R * 2 + 14
  const top = (d.title ? 40 : 14) + 22
  const plotH = Math.max(o.height - top - 90, rows * rowH + 10)
  const legendTop = top + plotH + 16
  const height = legendTop + 3 * 22 + 12
  const colW = (o.width - M.left - M.right) / gens.length
  const pos = new Map<string, { x: number; y: number }>()
  gens.forEach((g, gi) => {
    const list = byGen.get(g)!
    list.forEach((nd, i) => {
      pos.set(nd.id, {
        x: M.left + colW * gi + colW / 2,
        y: top + ((i + 0.5) * plotH) / list.length,
      })
    })
  })
  let body = heading(d.title, M.left)
  gens.forEach((g, gi) => {
    body += text(M.left + colW * gi + colW / 2, top - 8, g === 0 ? 'Index' : `Generation ${g}`, {
      size: 11.5,
      weight: 700,
      anchor: 'middle',
      fill: MUTED,
    })
  })
  for (const e of d.edges) {
    const a = pos.get(e.from)!
    const b = pos.get(e.to)!
    body += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${AXIS}" stroke-width="1" stroke-opacity="0.45"/>`
  }
  for (const nd of d.nodes) {
    const p = pos.get(nd.id)!
    body += shape(nd.status, p.x, p.y, R)
    if (rows <= 30) {
      const lab = nd.label ?? nd.id
      body +=
        nd.generation === 0
          ? text(p.x, p.y + R + 20, lab, { size: 10.5, fill: INK, anchor: 'middle' })
          : text(p.x + R + 6, p.y + 4, lab, { size: 10.5, fill: INK })
    }
  }
  let lx = M.left
  let ly = legendTop
  for (const s of CONTACT_STATUSES) {
    const used = d.nodes.filter((x) => x.status === s).length
    if (used === 0) continue
    const label = `${LABEL[s]} (${used})`
    const w = 40 + label.length * 6.4
    if (lx + w > o.width - M.right) {
      lx = M.left
      ly += 24
    }
    body += shape(s, lx + 10, ly, 7) + text(lx + 26, ly + 4, label, { size: 11.5 })
    lx += w
  }
  const count = (s: ContactNodeStatus): number => d.nodes.filter((x) => x.status === s).length
  const contacts = d.nodes.filter((x) => !['index', 'case'].includes(x.status))
  const unreach = count('unreachable')
  const summary =
    `${d.title ?? 'Contact tracing network'}: network of ${d.nodes.length} people over ${gens.length} generations. ` +
    CONTACT_STATUSES.filter((s) => count(s) > 0)
      .map((s) => `${count(s)} ${LABEL[s].toLowerCase()}`)
      .join(', ') +
    `. ${contacts.length} contacts listed, ${unreach} unreachable.`
  const from = new Map<string, string[]>()
  for (const e of d.edges) from.set(e.to, [...(from.get(e.to) ?? []), e.from])
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Contact tracing network',
      summary,
      body,
      idKey: esc(JSON.stringify(d)),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Person', 'Generation', 'Status', 'Exposed by'],
      rows: d.nodes.map((x) => [
        x.label ?? x.id,
        String(x.generation),
        LABEL[x.status],
        (from.get(x.id) ?? []).join(', '),
      ]),
    },
  }
}

export const epiContactNetworkKind: FigureKind<EpiContactNetworkData> = {
  kind: 'epi_contact_network',
  schema: EpiContactNetworkData,
  render,
}
