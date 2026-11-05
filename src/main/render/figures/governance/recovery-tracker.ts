// gov_recovery_tracker (spec 0459 FR-5): each critical function's recovery against its recovery
// time objective at the current exercise time. One row per function: a bar from the start of its
// recovery to its recovery (or to now), a diamond at its RTO, a dashed line at elapsed time, and a
// status that is a word and a symbol as well as a color.
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, STATUS_STYLES, type StatusState } from '../theme'
import { frame, heading, n, text, wrap } from '../svg'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

export const GovRecoveryData = z
  .object({
    title: z.string().max(200).optional(),
    /** Exercise hours since discovery. */
    elapsedHours: z.number().min(0).max(720),
    /** Right edge of the time axis; defaults to the larger of 24 and what the data needs. */
    horizonHours: z.number().min(1).max(720).optional(),
    functions: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          rtoHours: z.number().min(0).max(720),
          /** When recovery work began, hours since discovery. */
          startHour: z.number().min(0).max(720).optional(),
          /** When the function was back, hours since discovery; null or absent if not yet. */
          recoveredHour: z.number().min(0).max(720).nullable().optional(),
        }),
      )
      .min(1)
      .max(14),
  })
  .refine((d) => new Set(d.functions.map((f) => f.name)).size === d.functions.length, {
    message: 'function names must be unique',
  })
export type GovRecoveryData = z.infer<typeof GovRecoveryData>

export type RecoveryStatus =
  'recovered' | 'recovered_late' | 'past_rto' | 'in_progress' | 'not_started'

export const RECOVERY_STATUS_LABEL: Record<RecoveryStatus, string> = {
  recovered: 'Recovered within RTO',
  recovered_late: 'Recovered after RTO',
  past_rto: 'Past RTO',
  in_progress: 'In progress',
  not_started: 'Not started',
}
const STATUS_STATE: Record<RecoveryStatus, StatusState> = {
  recovered: 'ok',
  recovered_late: 'degraded',
  past_rto: 'down',
  in_progress: 'unknown',
  not_started: 'unknown',
}

type Fn = GovRecoveryData['functions'][number]

/** A function's status at `elapsed` hours: what has happened by then, not what happens later. */
export function recoveryStatus(f: Fn, elapsed: number): RecoveryStatus {
  if (f.recoveredHour != null && f.recoveredHour <= elapsed)
    return f.recoveredHour <= f.rtoHours ? 'recovered' : 'recovered_late'
  if (elapsed > f.rtoHours) return 'past_rto'
  if (f.startHour !== undefined && f.startHour <= elapsed) return 'in_progress'
  return 'not_started'
}

const niceStep = (span: number): number => {
  for (const s of [1, 2, 4, 6, 12, 24, 48, 72]) if (span / s <= 8) return s
  return 168
}

function render(d: GovRecoveryData, o: FigureOptions): FigureResult {
  const title = d.title ?? 'Recovery against recovery time objectives'
  const need = Math.max(
    24,
    d.elapsedHours,
    ...d.functions.flatMap((f) => [f.rtoHours, f.recoveredHour ?? 0]),
  )
  const horizon = d.horizonHours ?? Math.ceil(need / 6) * 6
  const left = 210
  const right = 190
  const plotW = o.width - left - right
  const x = (h: number): number => left + (Math.min(h, horizon) / horizon) * plotW
  const rowH = 34
  const top = (d.title === undefined ? 8 : 36) + 22
  const height = top + d.functions.length * rowH + 44
  const statuses = d.functions.map((f) => recoveryStatus(f, d.elapsedHours))

  let body = heading(title, 12)
  const step = niceStep(horizon)
  for (let h = 0; h <= horizon; h += step) {
    body += `<line x1="${n(x(h))}" x2="${n(x(h))}" y1="${top - 4}" y2="${top + d.functions.length * rowH}" stroke="${GRID}" stroke-width="1"/>`
    body += text(x(h), top - 8, `${h} h`, { size: 10, anchor: 'middle', fill: MUTED })
  }
  d.functions.forEach((f, i) => {
    const y = top + i * rowH
    const st = statuses[i]!
    const style = STATUS_STYLES[STATUS_STATE[st]]
    const label = wrap(f.name, 30, 2)
    label.forEach((ln, k) => {
      body += text(12, y + 17 + (k - (label.length - 1) / 2) * 12, ln, { size: 12, weight: 600 })
    })
    body += `<rect x="${left}" y="${y + 9}" width="${n(plotW)}" height="16" fill="#f3efe4"/>`
    if (f.startHour !== undefined) {
      const end = f.recoveredHour != null ? f.recoveredHour : d.elapsedHours
      const x0 = x(f.startHour)
      const x1 = Math.max(x(Math.min(end, d.elapsedHours)), x0)
      if (x1 > x0)
        body += `<rect x="${n(x0)}" y="${y + 9}" width="${n(x1 - x0)}" height="16" fill="${style.color}" fill-opacity="${f.recoveredHour != null && f.recoveredHour <= d.elapsedHours ? 1 : 0.45}"/>`
    }
    body += `<path d="M${n(x(f.rtoHours))} ${y + 4}l6 5l-6 5l-6 -5z" fill="${INK}"/>`
    body += `<line x1="${n(x(f.rtoHours))}" x2="${n(x(f.rtoHours))}" y1="${y + 14}" y2="${y + 28}" stroke="${INK}" stroke-width="1.5"/>`
    const sx = left + plotW + 18
    body += statusSymbol(style.symbol, style.color, sx, y + 17)
    body += text(sx + 14, y + 21, RECOVERY_STATUS_LABEL[st], {
      size: 12,
      weight: 700,
      fill: style.color,
    })
  })
  body += `<line x1="${n(x(d.elapsedHours))}" x2="${n(x(d.elapsedHours))}" y1="${top - 4}" y2="${top + d.functions.length * rowH}" stroke="${AXIS}" stroke-width="2" stroke-dasharray="6 4"/>`
  body += text(
    x(d.elapsedHours),
    top + d.functions.length * rowH + 14,
    `Now: ${d.elapsedHours} h`,
    {
      size: 11,
      weight: 700,
      anchor: 'middle',
    },
  )
  body += text(12, height - 6, 'Diamond = recovery time objective (RTO). Bar = recovery work.', {
    size: 10,
    fill: MUTED,
  })

  const count = (s: RecoveryStatus): number => statuses.filter((x2) => x2 === s).length
  const past = d.functions.filter((_f, i) => statuses[i] === 'past_rto').map((f) => f.name)
  const summary =
    `${title} at hour ${d.elapsedHours}: ${count('recovered')} of ${d.functions.length} functions recovered within their RTO, ` +
    `${count('recovered_late')} recovered after it, ${count('past_rto')} past RTO, ${count('in_progress')} in progress, ${count('not_started')} not started. ` +
    (past.length ? `Past RTO: ${past.join(', ')}. ` : '') +
    d.functions
      .map((f, i) => `${f.name}: RTO ${f.rtoHours} h, ${RECOVERY_STATUS_LABEL[statuses[i]!]}`)
      .join('; ') +
    '.'
  const columns = ['Function', 'RTO (h)', 'Recovery started (h)', 'Recovered at (h)', 'Status']
  const rows = d.functions.map((f, i) => [
    f.name,
    String(f.rtoHours),
    f.startHour === undefined ? '' : String(f.startHour),
    f.recoveredHour == null ? '' : String(f.recoveredHour),
    RECOVERY_STATUS_LABEL[statuses[i]!],
  ])
  return {
    svg: frame({ width: o.width, height, title, summary, body, idKey: JSON.stringify(d) }),
    summary,
    table: { caption: `${title} at hour ${d.elapsedHours}`, columns, rows },
  }
}

function statusSymbol(symbol: string, color: string, x0: number, y: number): string {
  switch (symbol) {
    case 'triangle':
      return `<path d="M${n(x0)} ${n(y - 7)}L${n(x0 + 7)} ${n(y + 6)}L${n(x0 - 7)} ${n(y + 6)}Z" fill="${color}"/>`
    case 'square':
      return `<rect x="${n(x0 - 6)}" y="${n(y - 6)}" width="12" height="12" fill="${color}"/>`
    case 'ring':
      return `<circle cx="${n(x0)}" cy="${n(y)}" r="5.5" fill="none" stroke="${color}" stroke-width="2.5"/>`
    default:
      return `<circle cx="${n(x0)}" cy="${n(y)}" r="6" fill="${color}"/>`
  }
}

export const govRecoveryTrackerKind: FigureKind<GovRecoveryData> = {
  kind: 'gov_recovery_tracker',
  schema: GovRecoveryData,
  render,
}
