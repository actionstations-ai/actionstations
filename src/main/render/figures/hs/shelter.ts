// Shelter figures (spec 0464 FR-7): hs_shelter_dashboard (population against capacity by site,
// needs by category, supply status) and hs_shelter_map (open shelters with an optional overlay of
// electricity-dependent residents). Status is always a word as well as a shape or fill pattern.
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, STATUS_STYLES, seriesStyle, type StatusState } from '../theme'
import { fmt, frame, heading, hashId, legend, n, patternDef, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const SiteStatus = z.enum(['open', 'full', 'closing'])
const SupplyState = z.enum(['ok', 'low', 'out'])
const SUPPLY_TO_STATUS: Record<'ok' | 'low' | 'out', StatusState> = {
  ok: 'ok',
  low: 'degraded',
  out: 'down',
}

// ---- dashboard ---------------------------------------------------------------------------------

export const HsShelterDashboardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  sites: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        population: z.number().int().min(0).max(100_000),
        capacity: z.number().int().min(1).max(100_000),
        status: SiteStatus,
      }),
    )
    .min(1)
    .max(12),
  needs: z
    .array(
      z.object({
        category: z.string().min(1).max(60),
        open: z.number().int().min(0).max(100_000),
        met: z.number().int().min(0).max(100_000),
      }),
    )
    .max(10)
    .default([]),
  supplies: z
    .array(
      z.object({
        item: z.string().min(1).max(60),
        state: SupplyState,
        detail: z.string().max(100).optional(),
      }),
    )
    .max(10)
    .default([]),
})
export type HsShelterDashboardData = z.infer<typeof HsShelterDashboardData>

const pct = (a: number, b: number): number => Math.round((a / b) * 100)

function renderDashboard(
  d: HsShelterDashboardData,
  o: { width: number; height: number },
): FigureResult {
  const id = hashId(JSON.stringify(d))
  const title = d.title ?? 'Shelter dashboard'
  const defs = [
    patternDef(`p${id}-0`, seriesStyle(0)),
    patternDef(`p${id}-1`, seriesStyle(2)),
  ].join('')
  const labelW = 190
  const barX = 24 + labelW
  const barW = o.width - barX - 150
  let y = (d.title ? 42 : 14) + 6
  let body = heading(d.title, 24)
  if (d.asOf)
    body += text(o.width - 24, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  body += text(24, y + 12, 'Population against capacity', { size: 13, weight: 700 })
  y += 22
  for (const s of d.sites) {
    const share = Math.min(1, s.population / s.capacity)
    wrap(s.name, 30, 2).forEach((ln, k) => {
      body += text(24, y + 17 + k * 13, ln, { size: 12.5, weight: 700 })
    })
    body += `<rect x="${n(barX)}" y="${n(y + 4)}" width="${n(barW)}" height="20" fill="#ffffff" stroke="${AXIS}" stroke-width="1.2"/>`
    body += `<rect x="${n(barX)}" y="${n(y + 4)}" width="${n(barW * share)}" height="20" fill="url(#p${id}-0)"/>`
    body += text(
      barX + barW + 10,
      y + 19,
      `${fmt(s.population)} of ${fmt(s.capacity)} (${pct(s.population, s.capacity)}%) ${s.status.toUpperCase()}`,
      { size: 11.5, weight: 700 },
    )
    y += 36
  }
  if (d.needs.length) {
    y += 8
    body += text(24, y + 12, 'Needs by category: met and still open', { size: 13, weight: 700 })
    y += 22
    const max = Math.max(1, ...d.needs.map((x) => x.open + x.met))
    for (const nd of d.needs) {
      wrap(nd.category, 30, 2).forEach((ln, k) => {
        body += text(24, y + 17 + k * 13, ln, { size: 12.5 })
      })
      const wMet = (nd.met / max) * barW
      const wOpen = (nd.open / max) * barW
      body += `<rect x="${n(barX)}" y="${n(y + 4)}" width="${n(wMet)}" height="18" fill="url(#p${id}-0)"/>`
      body += `<rect x="${n(barX + wMet)}" y="${n(y + 4)}" width="${n(wOpen)}" height="18" fill="url(#p${id}-1)"/>`
      body += text(barX + barW + 10, y + 18, `${nd.met} met, ${nd.open} open`, { size: 11.5 })
      y += 32
    }
  }
  if (d.supplies.length) {
    y += 8
    body += text(24, y + 12, 'Supplies', { size: 13, weight: 700 })
    y += 22
    for (const s of d.supplies) {
      const st = STATUS_STYLES[SUPPLY_TO_STATUS[s.state]]
      body += `<circle cx="34" cy="${n(y + 8)}" r="6" fill="${st.color}"/>`
      body += text(
        50,
        y + 13,
        `${s.item}: ${s.state.toUpperCase()}${s.detail ? `, ${s.detail}` : ''}`,
        { size: 12.5 },
      )
      y += 24
    }
  }
  const lg = legend(
    [
      {
        name: 'Population or need met',
        swatch: (x: number, yy: number) =>
          `<rect x="${n(x)}" y="${n(yy - 7)}" width="26" height="14" fill="url(#p${id}-0)" stroke="${INK}" stroke-width="0.8"/>`,
      },
      {
        name: 'Need still open',
        swatch: (x: number, yy: number) =>
          `<rect x="${n(x)}" y="${n(yy - 7)}" width="26" height="14" fill="url(#p${id}-1)" stroke="${INK}" stroke-width="0.8"/>`,
      },
    ],
    24,
    y + 14,
    o.width - 24,
  )
  body += lg.svg
  const height = y + 14 + lg.height + 12
  const totalPop = d.sites.reduce((a, s) => a + s.population, 0)
  const totalCap = d.sites.reduce((a, s) => a + s.capacity, 0)
  const full = d.sites.filter((s) => s.population >= s.capacity).map((s) => s.name)
  const open = d.needs.reduce((a, x) => a + x.open, 0)
  const met = d.needs.reduce((a, x) => a + x.met, 0)
  const lowSupplies = d.supplies
    .filter((s) => s.state !== 'ok')
    .map((s) => `${s.item} ${s.state.toUpperCase()}`)
  const summary =
    `${title}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.sites.length} shelters hold ${fmt(totalPop)} residents against ${fmt(totalCap)} spaces (${pct(totalPop, totalCap)}%). ` +
    (full.length ? `At or over capacity: ${full.join(', ')}. ` : 'No shelter is at capacity. ') +
    (d.needs.length
      ? `Needs: ${met} met and ${open} open across ${d.needs.length} categories. `
      : '') +
    (lowSupplies.length
      ? `Supplies to watch: ${lowSupplies.join(', ')}.`
      : d.supplies.length
        ? 'All supplies are OK.'
        : '')
  return {
    svg: frame({ width: o.width, height, title, summary, defs, body, idKey: id }),
    summary,
    table: {
      caption: title,
      columns: ['Kind', 'Name', 'Value', 'Detail'],
      rows: [
        ...d.sites.map((s) => [
          'Shelter',
          s.name,
          `${s.population} of ${s.capacity}`,
          s.status.toUpperCase(),
        ]),
        ...d.needs.map((x) => ['Need', x.category, `${x.met} met`, `${x.open} open`]),
        ...d.supplies.map((s) => ['Supply', s.item, s.state.toUpperCase(), s.detail ?? '']),
      ],
    },
  }
}

export const hsShelterDashboardKind: FigureKind<HsShelterDashboardData> = {
  kind: 'hs_shelter_dashboard',
  schema: HsShelterDashboardData,
  render: renderDashboard,
}

// ---- map ---------------------------------------------------------------------------------------

export const HsShelterMapData = z.object({
  title: z.string().max(200).optional(),
  shelters: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        lon: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
        status: SiteStatus,
        population: z.number().int().min(0).optional(),
        capacity: z.number().int().min(1).optional(),
      }),
    )
    .min(1)
    .max(30),
  /** Optional overlay of electricity-dependent residents by area; always drawn with its count. */
  overlay: z
    .object({
      label: z.string().min(1).max(100),
      areas: z
        .array(
          z.object({
            name: z.string().min(1).max(60),
            lon: z.number().min(-180).max(180),
            lat: z.number().min(-90).max(90),
            count: z.number().int().min(0).max(10_000_000),
          }),
        )
        .min(1)
        .max(40),
      /** Where the counts come from, with their date. */
      origin: z.string().min(1).max(200),
    })
    .optional(),
  simulated: z.boolean().default(true),
})
export type HsShelterMapData = z.infer<typeof HsShelterMapData>

const M = { left: 62, right: 24, bottom: 46 }

function renderMap(d: HsShelterMapData, o: { width: number; height: number }): FigureResult {
  const id = hashId(JSON.stringify(d))
  const title = d.title ?? 'Open shelters'
  const pts = [...d.shelters, ...(d.overlay?.areas ?? [])]
  const meanLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const kx = Math.cos((meanLat * Math.PI) / 180)
  const xs = pts.map((p) => p.lon * kx)
  const ys = pts.map((p) => p.lat)
  const spanX = Math.max(1e-4, Math.max(...xs) - Math.min(...xs))
  const spanY = Math.max(1e-4, Math.max(...ys) - Math.min(...ys))
  const x0 = Math.min(...xs) - spanX * 0.1
  const y0 = Math.min(...ys) - spanY * 0.1
  const w = spanX * 1.2
  const h = spanY * 1.2
  const top = d.title ? 42 : 14
  const keyLines = d.shelters.map((s, i) =>
    wrap(
      `${i + 1}. ${s.name}: ${s.status.toUpperCase()}${s.population !== undefined && s.capacity ? `, ${s.population} of ${s.capacity}` : ''}`,
      86,
      2,
    ),
  )
  const keyH = keyLines.reduce((s, l) => s + l.length * 15, 0)
  const plotW = o.width - M.left - M.right
  const plotH = o.height - top - M.bottom
  const scale = Math.min(plotW / w, plotH / h)
  const offX = M.left + (plotW - w * scale) / 2
  const offY = top + (plotH - h * scale) / 2
  const px = (lon: number): number => offX + (lon * kx - x0) * scale
  const py = (lat: number): number => offY + (h - (lat - y0)) * scale
  const maxCount = Math.max(1, ...(d.overlay?.areas.map((a) => a.count) ?? [1]))
  let body = heading(d.title, M.left)
  body += `<rect x="${n(M.left)}" y="${n(top)}" width="${n(plotW)}" height="${n(plotH)}" fill="#ffffff" stroke="${AXIS}" stroke-width="1.2"/>`
  for (let i = 1; i < 4; i++) {
    body += `<line x1="${n(M.left + (plotW * i) / 4)}" x2="${n(M.left + (plotW * i) / 4)}" y1="${n(top)}" y2="${n(top + plotH)}" stroke="${GRID}" stroke-dasharray="3 4"/>`
    body += `<line x1="${n(M.left)}" x2="${n(M.left + plotW)}" y1="${n(top + (plotH * i) / 4)}" y2="${n(top + (plotH * i) / 4)}" stroke="${GRID}" stroke-dasharray="3 4"/>`
  }
  for (const a of d.overlay?.areas ?? []) {
    const r = 6 + 22 * Math.sqrt(a.count / maxCount)
    body += `<circle cx="${n(px(a.lon))}" cy="${n(py(a.lat))}" r="${n(r)}" fill="${seriesStyle(4).color}" fill-opacity="0.28" stroke="${seriesStyle(4).color}" stroke-width="1.6" stroke-dasharray="4 3"/>`
    body += text(px(a.lon) + r + 6, py(a.lat) + 4, `${a.name}: ${fmt(a.count)}`, {
      size: 10.5,
      fill: MUTED,
    })
  }
  d.shelters.forEach((s, i) => {
    const x = px(s.lon)
    const y = py(s.lat)
    const st = STATUS_STYLES[s.status === 'open' ? 'ok' : s.status === 'full' ? 'down' : 'degraded']
    body += `<path d="M${n(x)} ${n(y - 12)}L${n(x + 12)} ${n(y)}L${n(x)} ${n(y + 12)}L${n(x - 12)} ${n(y)}Z" fill="${st.color}" stroke="#ffffff" stroke-width="1.5"/>`
    body += text(x, y + 4, String(i + 1), {
      size: 11,
      weight: 700,
      anchor: 'middle',
      fill: '#ffffff',
    })
  })
  body += text(
    M.left + plotW / 2,
    top + plotH + 30,
    d.simulated ? 'Schematic, no basemap. Positions are simulated.' : 'Schematic, no basemap.',
    { size: 11, anchor: 'middle', fill: MUTED },
  )
  let ky = o.height - 4
  keyLines.forEach((lines) =>
    lines.forEach((ln) => {
      ky += 15
      body += text(M.left, ky, ln, { size: 11.5 })
    }),
  )
  let height = o.height + keyH
  if (d.overlay) {
    const note = wrap(
      `Circles: ${d.overlay.label} (${d.overlay.origin}); the count is written on each.`,
      104,
      3,
    )
    note.forEach((ln, k) => {
      body += text(M.left, ky + 20 + k * 15, ln, { size: 11.5, fill: MUTED })
    })
    height += 8 + note.length * 15
  }
  const summary =
    `${title}: schematic map of ${d.shelters.length} shelters, ${d.shelters.filter((s) => s.status === 'open').length} open, ` +
    `${d.shelters.filter((s) => s.status === 'full').length} full, ${d.shelters.filter((s) => s.status === 'closing').length} closing. ` +
    (d.overlay
      ? `Overlay: ${d.overlay.label} (${d.overlay.origin}): ${d.overlay.areas.map((a) => `${a.name} ${fmt(a.count)}`).join(', ')}. `
      : '') +
    (d.simulated ? 'Positions are simulated.' : '')
  return {
    svg: frame({ width: o.width, height, title, summary, body, idKey: id }),
    summary,
    table: {
      caption: title,
      columns: ['Kind', 'Name', 'Status or count', 'Latitude', 'Longitude'],
      rows: [
        ...d.shelters.map((s, i) => [
          'Shelter',
          `${i + 1}. ${s.name}`,
          s.status.toUpperCase(),
          s.lat.toFixed(4),
          s.lon.toFixed(4),
        ]),
        ...(d.overlay?.areas ?? []).map((a) => [
          'Overlay',
          a.name,
          String(a.count),
          a.lat.toFixed(4),
          a.lon.toFixed(4),
        ]),
      ],
    },
  }
}

export const hsShelterMapKind: FigureKind<HsShelterMapData> = {
  kind: 'hs_shelter_map',
  schema: HsShelterMapData,
  render: renderMap,
}
