// Shared parts of the wildfire figure kinds (spec 0461 FR-7): the evacuation status words with a
// symbol and color each, the power shutoff statuses, a time formatter that names its time zone
// and a map helper that draws overlay layers with the shared map overlay code (#652) and adds a
// legend inside the picture. Colors never stand alone: every status is a word and a symbol.
import { z } from 'zod'
import type { OverlayLayer, OverlayToken } from '@shared/schemas/map-overlays'
import { legendEntries, mapFigure, TOKEN_STYLE, type LegendEntry } from '@shared/maps/overlays'
import { esc, n } from '../svg'
import type { FigureResult } from '../types'

export const LonLatT = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
export const RingT = z.array(LonLatT).min(3).max(1000)
export const PathT = z.array(LonLatT).min(2).max(1000)
export const IsoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')

/** Where the fire geometry came from; the figure says so in its summary and legend. */
export const BASIS = ['historical', 'interpolated', 'simulated'] as const
export const BasisT = z.enum(BASIS)
export type Basis = z.infer<typeof BasisT>

export const BASIS_TEXT: Record<Basis, string> = {
  historical:
    'Historical data: mapped perimeters at the times shown, with the retrieval date in the source.',
  interpolated:
    'Interpolated: the shapes between mapped perimeters are drawn by the app and are not observations.',
  simulated:
    'Simulated illustration made with a simple ellipse spread relation. It is not a fire behavior prediction.',
}

export const ZONE_STATUSES = [
  'Evacuation order',
  'Evacuation warning',
  'Shelter in place',
  'All clear',
  'Re-entry open',
  'No status',
] as const
export const ZoneStatusT = z.enum(ZONE_STATUSES)
export type ZoneStatus = z.infer<typeof ZoneStatusT>

export interface StatusLook {
  color: string
  tint: string
  symbol: 'square' | 'triangle' | 'diamond' | 'circle' | 'ring'
  token: OverlayToken
}

export const ZONE_LOOK: Record<ZoneStatus, StatusLook> = {
  'Evacuation order': { color: '#a50f2d', tint: '#fbe1e2', symbol: 'square', token: 'critical' },
  'Evacuation warning': { color: '#b3430f', tint: '#ffe9d6', symbol: 'triangle', token: 'warning' },
  'Shelter in place': { color: '#5b3f8a', tint: '#ece3f6', symbol: 'diamond', token: 'watch' },
  'All clear': { color: '#1b6e3a', tint: '#e3f3e8', symbol: 'circle', token: 'ok' },
  'Re-entry open': { color: '#1f5fa8', tint: '#e0ecf9', symbol: 'circle', token: 'info' },
  'No status': { color: '#5b6470', tint: '#ece6d8', symbol: 'ring', token: 'muted' },
}

export const SHUTOFF_STATUSES = [
  'Watch',
  'Scheduled',
  'Notified',
  'De-energized',
  'Patrolling',
  'Restored',
  'Canceled',
] as const
export const ShutoffStatusT = z.enum(SHUTOFF_STATUSES)
export type ShutoffStatus = z.infer<typeof ShutoffStatusT>

export const SHUTOFF_LOOK: Record<ShutoffStatus, Omit<StatusLook, 'token'>> = {
  Watch: { color: '#8a6100', tint: '#fff3d1', symbol: 'ring' },
  Scheduled: { color: '#b3430f', tint: '#ffe9d6', symbol: 'triangle' },
  Notified: { color: '#1f5fa8', tint: '#e0ecf9', symbol: 'diamond' },
  'De-energized': { color: '#a50f2d', tint: '#fbe1e2', symbol: 'square' },
  Patrolling: { color: '#5b3f8a', tint: '#ece3f6', symbol: 'diamond' },
  Restored: { color: '#1b6e3a', tint: '#e3f3e8', symbol: 'circle' },
  Canceled: { color: '#5b6470', tint: '#ece6d8', symbol: 'ring' },
}

/** A symbol centered on (x, y) for a status. */
export function symbolSvg(
  shape: StatusLook['symbol'],
  x: number,
  y: number,
  color: string,
): string {
  switch (shape) {
    case 'triangle':
      return `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y + 7)}L${n(x - 8)} ${n(y + 7)}Z" fill="${color}"/>`
    case 'square':
      return `<rect x="${n(x - 7)}" y="${n(y - 7)}" width="14" height="14" fill="${color}"/>`
    case 'diamond':
      return `<path d="M${n(x)} ${n(y - 9)}L${n(x + 8)} ${n(y)}L${n(x)} ${n(y + 9)}L${n(x - 8)} ${n(y)}Z" fill="${color}"/>`
    case 'ring':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="6.5" fill="none" stroke="${color}" stroke-width="2.5"/>`
    default:
      return `<circle cx="${n(x)}" cy="${n(y)}" r="7" fill="${color}"/>`
  }
}

/** "4:55 PM PDT" in a time zone (IANA name); UTC when none is given. */
export function clockIn(time: string, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(Date.parse(time)))
}

/** "Sep 12, 4:55 PM PDT". */
export function dayClockIn(time: string, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(Date.parse(time)))
}

export const TimeZoneT = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      return true
    } catch {
      return false
    }
  }, 'not a time zone')

function legendBlock(
  entries: readonly LegendEntry[],
  width: number,
  y0: number,
): { svg: string; height: number } {
  let x = 10
  let y = y0 + 14
  let out = ''
  for (const e of entries) {
    for (const item of e.items) {
      const label = `${e.label}${e.items.length > 1 || item.label !== e.label ? `: ${item.label}` : ''}`
      const w = 34 + label.length * 6.6 + 16
      if (x + w > width - 10 && x > 10) {
        x = 10
        y += 20
      }
      const dash = item.dash.length
        ? ` stroke-dasharray="${item.dash.map((d) => d * 2).join(' ')}"`
        : ''
      const st = `stroke="${item.color}" stroke-width="2"${dash}`
      out +=
        e.swatch === 'line'
          ? `<path d="M${x} ${y} h22" ${st} fill="none"/>`
          : e.swatch === 'point'
            ? `<circle cx="${x + 11}" cy="${y}" r="5" fill="${item.color}" fill-opacity="0.5" ${st}/>`
            : `<rect x="${x}" y="${y - 7}" width="22" height="14" fill="${item.color}" fill-opacity="0.4" ${st}/>`
      out += `<text x="${x + 28}" y="${y + 4}" font-size="12" fill="#1c232b">${esc(label)}</text>`
      x += w
    }
  }
  return { svg: out, height: y - y0 + 14 }
}

export interface OverlayJob {
  title: string
  layers: OverlayLayer[]
  at?: number | null
  width: number
  idPrefix: string
  /** Sentences added to the end of the summary. */
  notes: string[]
  /** Extra summary text placed before the generic overlay summary. */
  lead?: string
}

/** Draw overlay layers with the shared overlay code and a legend inside the SVG. */
export function overlayFigure(job: OverlayJob): FigureResult {
  const fig = mapFigure({
    title: job.title,
    layers: job.layers,
    at: job.at ?? null,
    width: job.width,
    idPrefix: job.idPrefix,
  })
  const summary = [job.lead, fig.summary, ...job.notes].filter(Boolean).join(' ')
  const entries = legendEntries(
    job.layers.filter((l) => (l.kind === 'raster' ? true : l.features.length > 0)),
  )
  const legend = legendBlock(entries, job.width, fig.height)
  const total = Math.round((fig.height + legend.height + 10) * 10) / 10
  const svg = fig.svg
    .replace(/viewBox="0 0 (\d+) [\d.]+"/, `viewBox="0 0 $1 ${total}"`)
    .replace(/(<svg[^>]*?) height="[\d.]+"/, `$1 height="${total}"`)
    .replace(/<desc id="([^"]+)">[^<]*<\/desc>/, `<desc id="$1">${esc(summary)}</desc>`)
    .replace(
      '</svg>',
      `<rect y="${fig.height}" width="${job.width}" height="${total - fig.height}" fill="#ffffff"/>${legend.svg}</svg>`,
    )
  return {
    svg,
    summary,
    table: { caption: job.title, columns: fig.table.columns, rows: fig.table.rows },
  }
}

export { TOKEN_STYLE }
