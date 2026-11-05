// meteogram: stacked panels of one station's observations or forecast over time (temperature
// and dewpoint, wind speed with gusts and direction, pressure, precipitation) on a shared time
// axis. Each panel is drawn only when its data are given. Lines differ by dash and marker as
// well as color, and the summary and table carry the extremes and totals.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { INK, MUTED, GRID } from '../theme'
import { frame, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { utcLabel } from './radar'

const arr = (min = -1e9, max = 1e9) =>
  z.array(z.number().min(min).max(max).nullable()).min(2).max(200)

export const MeteogramData = z
  .object({
    title: z.string().max(200).optional(),
    origin: z.enum(['historical', 'simulated']),
    station: z.object({ id: z.string().min(2).max(8), name: z.string().max(80).optional() }),
    /** Times of the samples, ISO 8601, ascending. */
    times: z
      .array(z.iso.datetime({ offset: true }))
      .min(2)
      .max(200),
    tempF: arr(-100, 150).optional(),
    dewpointF: arr(-100, 120).optional(),
    windKt: arr(0, 250).optional(),
    gustKt: arr(0, 300).optional(),
    windDirDeg: arr(0, 360).optional(),
    pressureMb: arr(850, 1100).optional(),
    /** Precipitation in each interval, inches. */
    precipIn: arr(0, 30).optional(),
  })
  .superRefine((d, ctx) => {
    for (const k of [
      'tempF',
      'dewpointF',
      'windKt',
      'gustKt',
      'windDirDeg',
      'pressureMb',
      'precipIn',
    ] as const) {
      const v = d[k]
      if (v && v.length !== d.times.length)
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: `${k} needs ${d.times.length} values, one per time`,
        })
    }
    if (!d.tempF && !d.windKt && !d.pressureMb && !d.precipIn)
      ctx.addIssue({ code: 'custom', message: 'give at least one series' })
  })
export type MeteogramData = z.infer<typeof MeteogramData>

const HOUR = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}Z`
}

interface Series {
  name: string
  values: (number | null)[]
  color: string
  dash: string | undefined
  marker: 'circle' | 'square'
}

function extreme(
  v: (number | null)[],
  times: string[],
  max: boolean,
): { value: number; time: string } | undefined {
  let best: { value: number; time: string } | undefined
  v.forEach((x, i) => {
    if (x === null) return
    if (!best || (max ? x > best.value : x < best.value)) best = { value: x, time: times[i]! }
  })
  return best
}

function render(d: MeteogramData, o: { width: number; height: number }): FigureResult {
  const left = 58
  const right = 20
  const top = d.title ? 34 : 12
  const bottom = 56
  const plotW = o.width - left - right
  const panels: { label: string; unit: string; series: Series[]; bars?: (number | null)[] }[] = []
  if (d.tempF)
    panels.push({
      label: 'Temperature and dewpoint',
      unit: 'F',
      series: [
        {
          name: 'Temperature',
          values: d.tempF,
          color: '#b3121b',
          dash: undefined,
          marker: 'circle',
        },
        ...(d.dewpointF
          ? [
              {
                name: 'Dewpoint',
                values: d.dewpointF,
                color: '#1b7a3a',
                dash: '2 3',
                marker: 'square' as const,
              },
            ]
          : []),
      ],
    })
  if (d.windKt)
    panels.push({
      label: 'Wind',
      unit: 'kt',
      series: [
        { name: 'Wind', values: d.windKt, color: '#1f5fbf', dash: undefined, marker: 'circle' },
        ...(d.gustKt
          ? [
              {
                name: 'Gust',
                values: d.gustKt,
                color: '#6d3fb5',
                dash: '7 4',
                marker: 'square' as const,
              },
            ]
          : []),
      ],
    })
  if (d.pressureMb)
    panels.push({
      label: 'Pressure',
      unit: 'mb',
      series: [
        {
          name: 'Pressure',
          values: d.pressureMb,
          color: '#8a4b00',
          dash: undefined,
          marker: 'circle',
        },
      ],
    })
  if (d.precipIn)
    panels.push({ label: 'Precipitation per interval', unit: 'in', series: [], bars: d.precipIn })
  const gap = 26
  const panelH = (o.height - top - bottom - gap * (panels.length - 1)) / panels.length
  const t0 = Date.parse(d.times[0]!)
  const t1 = Date.parse(d.times[d.times.length - 1]!)
  const xOf = (iso: string): number => left + ((Date.parse(iso) - t0) / (t1 - t0 || 1)) * plotW
  let body = d.title ? text(16, 22, d.title, { size: 15, weight: 700 }) : ''
  panels.forEach((p, k) => {
    const y0 = top + k * (panelH + gap)
    const all = [...p.series.flatMap((s) => s.values), ...(p.bars ?? [])].filter(
      (v): v is number => v !== null,
    )
    const lo = p.bars ? 0 : Math.min(...all)
    const hi = Math.max(...all, p.bars ? 0.05 : lo + 1)
    const y = scaleLinear()
      .domain([lo, hi])
      .nice(4)
      .range([y0 + panelH, y0])
    body += `<rect x="${left}" y="${n(y0)}" width="${plotW}" height="${n(panelH)}" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`
    for (const t of y.ticks(4)) {
      body += `<path d="M${left} ${n(y(t))}H${left + plotW}" stroke="${GRID}" stroke-width="0.7"/>${text(left - 6, y(t) + 4, String(t), { size: 10, anchor: 'end', fill: MUTED })}`
    }
    body += text(left + 6, y0 + 13, `${p.label} (${p.unit})`, { size: 11, weight: 700 })
    if (p.bars) {
      const bw = Math.max(2, plotW / d.times.length - 2)
      p.bars.forEach((v, i) => {
        if (v === null || v <= 0) return
        body += `<rect x="${n(xOf(d.times[i]!) - bw / 2)}" y="${n(y(v))}" width="${n(bw)}" height="${n(y(0) - y(v))}" fill="#31a354" stroke="${INK}" stroke-width="0.5"/>`
      })
    }
    p.series.forEach((s, si) => {
      let path = ''
      let pen = false
      s.values.forEach((v, i) => {
        if (v === null) {
          pen = false
          return
        }
        path += `${pen ? 'L' : 'M'}${n(xOf(d.times[i]!))} ${n(y(v))}`
        pen = true
      })
      body += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`
      s.values.forEach((v, i) => {
        if (v === null || d.times.length > 40) return
        const cx = xOf(d.times[i]!)
        body +=
          s.marker === 'circle'
            ? `<circle cx="${n(cx)}" cy="${n(y(v))}" r="2.6" fill="${s.color}"/>`
            : `<rect x="${n(cx - 2.4)}" y="${n(y(v) - 2.4)}" width="4.8" height="4.8" fill="${s.color}"/>`
      })
      body += `<path d="M${left + plotW - 140} ${n(y0 + 12 + si * 14 - 4)}h22" stroke="${s.color}" stroke-width="2.2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>${text(left + plotW - 112, y0 + 12 + si * 14, s.name, { size: 10, fill: MUTED })}`
    })
    if (p.label === 'Wind' && d.windDirDeg && d.times.length <= 40)
      d.windDirDeg.forEach((dir, i) => {
        if (dir === null) return
        const cx = xOf(d.times[i]!)
        const rad = ((dir + 180) * Math.PI) / 180
        const cy = y0 + panelH - 10
        body += `<path d="M${n(cx - 6 * Math.sin(rad))} ${n(cy + 6 * Math.cos(rad))}L${n(cx + 6 * Math.sin(rad))} ${n(cy - 6 * Math.cos(rad))}" stroke="${INK}" stroke-width="1.4"/><circle cx="${n(cx + 6 * Math.sin(rad))}" cy="${n(cy - 6 * Math.cos(rad))}" r="2.2" fill="${INK}"/>`
      })
  })
  const axisY = top + panels.length * panelH + (panels.length - 1) * gap
  const step = Math.max(1, Math.ceil(d.times.length / 12))
  d.times.forEach((t, i) => {
    if (i % step) return
    body += `<path d="M${n(xOf(t))} ${n(axisY)}v4" stroke="${INK}"/>${text(xOf(t), axisY + 16, HOUR(t), { size: 10, anchor: 'middle', fill: MUTED })}`
  })
  const originWord = d.origin === 'historical' ? 'Historical data' : 'Simulated data'
  body += text(
    left,
    axisY + 34,
    `${d.station.id}${d.station.name ? ` ${d.station.name}` : ''} · ${utcLabel(d.times[0]!)} to ${utcLabel(d.times[d.times.length - 1]!)} · ${originWord} · exercise figure`,
    { size: 11, fill: MUTED },
  )

  const rows: string[][] = []
  const sentences: string[] = []
  const when = (t: string): string => HOUR(t)
  const tHi = d.tempF && extreme(d.tempF, d.times, true)
  const tLo = d.tempF && extreme(d.tempF, d.times, false)
  if (tHi && tLo) {
    rows.push(
      ['Highest temperature', `${Math.round(tHi.value)} F at ${when(tHi.time)}`],
      ['Lowest temperature', `${Math.round(tLo.value)} F at ${when(tLo.time)}`],
    )
    sentences.push(
      `Temperature ranges from ${Math.round(tLo.value)} F at ${when(tLo.time)} to ${Math.round(tHi.value)} F at ${when(tHi.time)}.`,
    )
  }
  const gHi = d.gustKt ? extreme(d.gustKt, d.times, true) : undefined
  const wHi = d.windKt && extreme(d.windKt, d.times, true)
  if (wHi) {
    rows.push(['Highest sustained wind', `${Math.round(wHi.value)} kt at ${when(wHi.time)}`])
    sentences.push(
      `The highest sustained wind is ${Math.round(wHi.value)} kt at ${when(wHi.time)}.`,
    )
  }
  if (gHi) {
    rows.push(['Highest gust', `${Math.round(gHi.value)} kt at ${when(gHi.time)}`])
    sentences.push(`The highest gust is ${Math.round(gHi.value)} kt at ${when(gHi.time)}.`)
  }
  if (d.pressureMb) {
    const vals = d.pressureMb.filter((v): v is number => v !== null)
    const change = vals[vals.length - 1]! - vals[0]!
    rows.push(['Pressure change', `${change >= 0 ? '+' : ''}${change.toFixed(1)} mb`])
    sentences.push(
      `Pressure ${change < 0 ? 'falls' : 'rises'} ${Math.abs(change).toFixed(1)} mb over the period.`,
    )
  }
  if (d.precipIn) {
    const total = d.precipIn.reduce<number>((s, v) => s + (v ?? 0), 0)
    rows.push(['Total precipitation', `${total.toFixed(2)} in`])
    sentences.push(`Total precipitation is ${total.toFixed(2)} in.`)
  }
  const summary = `Meteogram for ${d.station.id}${d.station.name ? ` (${d.station.name})` : ''}, ${utcLabel(d.times[0]!)} to ${utcLabel(d.times[d.times.length - 1]!)}, ${originWord.toLowerCase()}. ${sentences.join(' ')}`
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: `Meteogram, ${d.station.id}`,
      summary,
      body,
      idKey: `met${d.station.id}${d.times[0]}`,
    }),
    summary,
    table: { caption: `Meteogram extremes, ${d.station.id}`, columns: ['Measure', 'Value'], rows },
  }
}

export const meteogramKind: FigureKind<MeteogramData> = {
  kind: 'meteogram',
  schema: MeteogramData,
  render,
  defaultHeight: 620,
}
