// structures_site_plan: a site logistics plan drawn to scale from entered geometry (spec 0471
// FR-5): buildings, laydown areas, excavations, the crane with its swing radius, access and haul
// routes, gates, the exclusion zone and the muster point. Coordinates are feet from the lower
// left corner of the site. Every feature has a number and a shape or pattern; a key below the
// plan and the data table give names and positions, so nothing depends on color. The plan
// refuses a muster point inside an exclusion zone or a feature outside the site.
import { z } from 'zod'
import { AXIS, INK, MUTED, GRID } from '../theme'
import { frame, heading, hashId, n, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const Ft = z.number().finite().min(-100_000).max(100_000)
const Name = z.string().min(1).max(60)
const Rect = {
  x: Ft,
  y: Ft,
  w: z.number().positive().max(100_000),
  h: z.number().positive().max(100_000),
}

const Feature = z.discriminatedUnion('type', [
  z.object({ type: z.literal('building'), name: Name, ...Rect }),
  z.object({ type: z.literal('laydown'), name: Name, ...Rect }),
  z.object({ type: z.literal('excavation'), name: Name, ...Rect }),
  z.object({
    type: z.literal('crane'),
    name: Name,
    x: Ft,
    y: Ft,
    radiusFt: z.number().positive().max(1000),
  }),
  z.object({
    type: z.literal('exclusion_circle'),
    name: Name,
    x: Ft,
    y: Ft,
    radiusFt: z.number().positive().max(2000),
  }),
  z.object({ type: z.literal('exclusion_rect'), name: Name, ...Rect }),
  z.object({
    type: z.literal('route'),
    name: Name,
    kind: z.enum(['access', 'haul', 'egress']),
    points: z
      .array(z.tuple([Ft, Ft]))
      .min(2)
      .max(40),
  }),
  z.object({ type: z.literal('gate'), name: Name, x: Ft, y: Ft }),
  z.object({ type: z.literal('muster'), name: Name, x: Ft, y: Ft }),
])
type Feature = z.infer<typeof Feature>

export const StructuresSitePlanData = z
  .object({
    title: z.string().max(200).optional(),
    site: z.object({
      name: z.string().max(80).optional(),
      widthFt: z.number().positive().max(100_000),
      heightFt: z.number().positive().max(100_000),
    }),
    features: z.array(Feature).min(1).max(60),
  })
  .superRefine((d, ctx) => {
    d.features.forEach((f, i) => {
      // A swing radius or an exclusion circle may reach past the fence; its center may not.
      const box =
        f.type === 'crane' || f.type === 'exclusion_circle'
          ? { minX: f.x, minY: f.y, maxX: f.x, maxY: f.y }
          : bounds(f)
      if (box.minX < 0 || box.minY < 0 || box.maxX > d.site.widthFt || box.maxY > d.site.heightFt)
        ctx.addIssue({
          code: 'custom',
          path: ['features', i],
          message: `${f.name} reaches outside the site`,
        })
    })
    const zones = d.features.filter(
      (f) => f.type === 'exclusion_circle' || f.type === 'exclusion_rect',
    )
    d.features.forEach((f, i) => {
      if (f.type === 'muster' && zones.some((z0) => inside(z0, f.x, f.y)))
        ctx.addIssue({
          code: 'custom',
          path: ['features', i],
          message: `The muster point ${f.name} is inside an exclusion zone`,
        })
    })
  })
export type StructuresSitePlanData = z.infer<typeof StructuresSitePlanData>

function bounds(f: Feature): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (f.type) {
    case 'building':
    case 'laydown':
    case 'excavation':
    case 'exclusion_rect':
      return { minX: f.x, minY: f.y, maxX: f.x + f.w, maxY: f.y + f.h }
    case 'crane':
    case 'exclusion_circle':
      return {
        minX: f.x - f.radiusFt,
        minY: f.y - f.radiusFt,
        maxX: f.x + f.radiusFt,
        maxY: f.y + f.radiusFt,
      }
    case 'route': {
      const xs = f.points.map((p) => p[0])
      const ys = f.points.map((p) => p[1])
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      }
    }
    default:
      return { minX: f.x, minY: f.y, maxX: f.x, maxY: f.y }
  }
}

function inside(z0: Feature, x: number, y: number): boolean {
  if (z0.type === 'exclusion_circle') return Math.hypot(x - z0.x, y - z0.y) <= z0.radiusFt
  if (z0.type === 'exclusion_rect')
    return x >= z0.x && x <= z0.x + z0.w && y >= z0.y && y <= z0.y + z0.h
  return false
}

const TYPE_LABEL: Record<Feature['type'], string> = {
  building: 'Building',
  laydown: 'Laydown area',
  excavation: 'Excavation',
  crane: 'Crane (swing radius)',
  exclusion_circle: 'Exclusion zone',
  exclusion_rect: 'Exclusion zone',
  route: 'Route',
  gate: 'Gate',
  muster: 'Muster point',
}

const where = (f: Feature): string => {
  switch (f.type) {
    case 'building':
    case 'laydown':
    case 'excavation':
    case 'exclusion_rect':
      return `at ${f.x}, ${f.y} ft, ${f.w} by ${f.h} ft`
    case 'crane':
    case 'exclusion_circle':
      return `centered at ${f.x}, ${f.y} ft, radius ${f.radiusFt} ft`
    case 'route':
      return `${f.kind} route through ${f.points.length} points from ${f.points[0]!.join(', ')} ft to ${f.points[f.points.length - 1]!.join(', ')} ft`
    default:
      return `at ${f.x}, ${f.y} ft`
  }
}

const M = { left: 16, right: 16, top: 34 }

function render(d: StructuresSitePlanData, o: { width: number; height: number }): FigureResult {
  const key = d.features
  const plotW = o.width - M.left - M.right
  const scale = Math.min(plotW / d.site.widthFt, 420 / d.site.heightFt)
  const pw = d.site.widthFt * scale
  const ph = d.site.heightFt * scale
  const x0 = M.left + (plotW - pw) / 2
  const y0 = M.top
  const X = (ft: number): number => x0 + ft * scale
  const Y = (ft: number): number => y0 + ph - ft * scale
  const id = hashId(JSON.stringify(d))
  const defs =
    `<pattern id="xz-${id}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-1 1L1 -1M0 8L8 0M7 9L9 7" stroke="#b3121b" stroke-width="1.6"/></pattern>` +
    `<pattern id="ex-${id}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0L8 8M8 0L0 8" stroke="#594c3c" stroke-width="1.2"/></pattern>` +
    `<pattern id="ld-${id}" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#594c3c"/><circle cx="6" cy="6" r="1.2" fill="#594c3c"/></pattern>`

  let body = heading(d.title, M.left)
  body += `<rect x="${n(x0)}" y="${n(y0)}" width="${n(pw)}" height="${n(ph)}" fill="#fbf8ef" stroke="${AXIS}" stroke-width="2"/>`
  // 10-unit grid with a scale bar: gridlines every 50 ft (or 100 for large sites).
  const step = d.site.widthFt > 600 ? 100 : 50
  for (let v = step; v < d.site.widthFt; v += step)
    body += `<line x1="${n(X(v))}" x2="${n(X(v))}" y1="${n(y0)}" y2="${n(y0 + ph)}" stroke="${GRID}" stroke-width="1"/>`
  for (let v = step; v < d.site.heightFt; v += step)
    body += `<line x1="${n(x0)}" x2="${n(x0 + pw)}" y1="${n(Y(v))}" y2="${n(Y(v))}" stroke="${GRID}" stroke-width="1"/>`

  // Order: zones first, then areas, then routes, then points.
  const order: Feature['type'][] = [
    'exclusion_rect',
    'exclusion_circle',
    'laydown',
    'excavation',
    'building',
    'route',
    'crane',
    'gate',
    'muster',
  ]
  const numbered = key.map((f, i) => ({ f, no: i + 1 }))
  const centers: string[] = []
  for (const t of order) {
    for (const { f, no } of numbered.filter((e) => e.f.type === t)) {
      const b = bounds(f)
      const cx = X((b.minX + b.maxX) / 2)
      const cy = Y((b.minY + b.maxY) / 2)
      switch (f.type) {
        case 'exclusion_rect':
          body += `<rect x="${n(X(f.x))}" y="${n(Y(f.y + f.h))}" width="${n(f.w * scale)}" height="${n(f.h * scale)}" fill="url(#xz-${id})" stroke="#b3121b" stroke-width="2.5" stroke-dasharray="8 4"/>`
          break
        case 'exclusion_circle':
          body += `<circle cx="${n(X(f.x))}" cy="${n(Y(f.y))}" r="${n(f.radiusFt * scale)}" fill="url(#xz-${id})" stroke="#b3121b" stroke-width="2.5" stroke-dasharray="8 4"/>`
          break
        case 'laydown':
          body += `<rect x="${n(X(f.x))}" y="${n(Y(f.y + f.h))}" width="${n(f.w * scale)}" height="${n(f.h * scale)}" fill="url(#ld-${id})" stroke="#594c3c" stroke-width="1.5"/>`
          break
        case 'excavation':
          body += `<rect x="${n(X(f.x))}" y="${n(Y(f.y + f.h))}" width="${n(f.w * scale)}" height="${n(f.h * scale)}" fill="url(#ex-${id})" stroke="${INK}" stroke-width="2"/>`
          break
        case 'building':
          body += `<rect x="${n(X(f.x))}" y="${n(Y(f.y + f.h))}" width="${n(f.w * scale)}" height="${n(f.h * scale)}" fill="#d9dee5" stroke="${INK}" stroke-width="2"/>`
          break
        case 'route': {
          const pts = f.points.map((p) => `${n(X(p[0]))},${n(Y(p[1]))}`).join(' ')
          const dash =
            f.kind === 'access'
              ? ''
              : f.kind === 'haul'
                ? ' stroke-dasharray="10 5"'
                : ' stroke-dasharray="2 5"'
          body += `<polyline points="${pts}" fill="none" stroke="#1f5fbf" stroke-width="3.5"${dash} stroke-linejoin="round"/>`
          break
        }
        case 'crane':
          body +=
            `<circle cx="${n(X(f.x))}" cy="${n(Y(f.y))}" r="${n(f.radiusFt * scale)}" fill="none" stroke="#8a4b00" stroke-width="2" stroke-dasharray="3 4"/>` +
            `<path d="M${n(X(f.x) - 8)} ${n(Y(f.y))}L${n(X(f.x) + 8)} ${n(Y(f.y))}M${n(X(f.x))} ${n(Y(f.y) - 8)}L${n(X(f.x))} ${n(Y(f.y) + 8)}" stroke="#8a4b00" stroke-width="3"/>`
          break
        case 'gate':
          body += `<path d="M${n(X(f.x) - 7)} ${n(Y(f.y) - 7)}H${n(X(f.x) + 7)}V${n(Y(f.y) + 7)}H${n(X(f.x) - 7)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`
          break
        case 'muster':
          body += `<path d="M${n(X(f.x))} ${n(Y(f.y) - 10)}L${n(X(f.x) + 10)} ${n(Y(f.y) + 8)}L${n(X(f.x) - 10)} ${n(Y(f.y) + 8)}Z" fill="#1b7a3a" stroke="#ffffff" stroke-width="1.5"/>`
          break
      }
      const pointLike = f.type === 'gate' || f.type === 'muster'
      const lx =
        f.type === 'crane' || f.type === 'exclusion_circle' ? X(f.x) : pointLike ? cx + 17 : cx
      const ly =
        f.type === 'crane' || f.type === 'exclusion_circle' ? Y(f.y) - 14 : pointLike ? cy - 15 : cy
      centers.push(
        `<circle cx="${n(lx)}" cy="${n(ly)}" r="9" fill="${INK}"/>` +
          text(lx, ly + 4, String(no), {
            size: 11,
            weight: 700,
            fill: '#ffffff',
            anchor: 'middle',
          }),
      )
    }
  }
  body += centers.join('')

  // Scale bar and north arrow.
  const bar = step * scale
  body += `<path d="M${n(x0)} ${n(y0 + ph + 14)}H${n(x0 + bar)}M${n(x0)} ${n(y0 + ph + 9)}V${n(y0 + ph + 19)}M${n(x0 + bar)} ${n(y0 + ph + 9)}V${n(y0 + ph + 19)}" stroke="${INK}" stroke-width="1.5"/>`
  body += text(x0 + bar + 8, y0 + ph + 18, `${step} ft`, { size: 11, fill: MUTED })
  body += text(x0 + pw - 4, y0 + ph + 18, 'North is up', { size: 11, fill: MUTED, anchor: 'end' })

  // Key.
  let y = y0 + ph + 40
  body += text(M.left, y, 'Key', { size: 12, weight: 700 })
  y += 18
  for (const { f, no } of numbered) {
    const line = wrap(
      `${no}. ${TYPE_LABEL[f.type]}: ${f.name}, ${where(f)}`,
      Math.floor(plotW / 6.3),
      1,
    )[0]!
    body += text(M.left, y, line, { size: 12 })
    y += 17
  }
  const height = Math.ceil(y + 6)

  const summary =
    `${d.title ?? 'Site plan'}${d.site.name ? ` for ${d.site.name}` : ''}: ${d.site.widthFt} by ${d.site.heightFt} ft, ${d.features.length} features, north is up. ` +
    numbered.map(({ f, no }) => `${no}. ${TYPE_LABEL[f.type]} ${f.name}, ${where(f)}.`).join(' ')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Site logistics plan',
      summary,
      defs,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['No.', 'Type', 'Name', 'Position and size'],
      rows: numbered.map(({ f, no }) => [String(no), TYPE_LABEL[f.type], f.name, where(f)]),
    },
  }
}

export const structuresSitePlanKind: FigureKind<StructuresSitePlanData> = {
  kind: 'structures_site_plan',
  schema: StructuresSitePlanData,
  render,
}
