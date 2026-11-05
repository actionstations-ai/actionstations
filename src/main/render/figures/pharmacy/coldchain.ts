// pharmacy_cold_chain_chart (spec 0463 FR-5): a storage unit's probe temperature against its
// labeled range, with the range band, excursion spans shaded and labeled in words, an optional
// ambient line and Fahrenheit tick labels on the right. Simulated or logged data, labeled as such.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { cToF, excursionSpans, minutesOutsideRange } from '../../../../shared/pharmacy/arithmetic'
import { fmt, frame, heading, hashId, legend, n, patternDef, text } from '../svg'
import { AXIS, GRID, MUTED, seriesStyle } from '../theme'
import type { FigureKind, FigureResult } from '../types'

const Point = z.object({ x: z.number().finite().min(0), tempC: z.number().finite() })

export const ColdChainData = z
  .object({
    title: z.string().max(200).optional(),
    unit: z.string().min(1).max(60),
    /** What the series is, e.g. "Simulated probe" or "Data logger". */
    source: z.string().max(80).default('Simulated probe'),
    lowC: z.number().finite(),
    highC: z.number().finite(),
    /** Label of the x axis; x is minutes from the start. */
    xLabel: z.string().max(60).default('Minutes from start'),
    probe: z.array(Point).min(2).max(1000),
    ambient: z.array(Point).max(1000).default([]),
  })
  .refine((d) => d.lowC < d.highC, { message: 'lowC must be below highC' })
export type ColdChainData = z.infer<typeof ColdChainData>

const clock = (m: number): string => `${fmt(Math.round(m))} min`

function renderColdChain(d: ColdChainData, o: { width: number; height: number }): FigureResult {
  const probe = [...d.probe].sort((a, b) => a.x - b.x)
  const ambient = [...d.ambient].sort((a, b) => a.x - b.x)
  const top = d.title ? 40 : 14
  const L = 58
  const R = o.width - 58
  const bottom = o.height - 84
  const temps = [...probe, ...ambient].map((p) => p.tempC).concat(d.lowC, d.highC)
  const sy = scaleLinear()
    .domain([Math.min(...temps), Math.max(...temps)])
    .nice()
    .range([bottom, top])
  const sx = scaleLinear()
    .domain([probe[0]!.x, probe.at(-1)!.x])
    .range([L, R])
  const spans = excursionSpans(probe, d.lowC, d.highC)
  const minutes = minutesOutsideRange(probe, d.lowC, d.highC)
  const id = `ex-${hashId(JSON.stringify(d))}`
  const hatch = patternDef(id, { ...seriesStyle(1), pattern: 'hatch' })
  let body = heading(d.title ?? `${d.unit}: temperature`, 12)
  for (const t of sy.ticks(6)) {
    body += `<line x1="${L}" x2="${R}" y1="${n(sy(t))}" y2="${n(sy(t))}" stroke="${GRID}"/>`
    body += text(L - 8, sy(t) + 4, `${fmt(t)}`, { size: 11, anchor: 'end', fill: MUTED })
    body += text(R + 8, sy(t) + 4, `${fmt(Math.round(cToF(t)))}`, { size: 11, fill: MUTED })
  }
  body += text(L - 8, top - 6, '°C', { size: 11, anchor: 'end', weight: 600, fill: MUTED })
  body += text(R + 8, top - 6, '°F', { size: 11, weight: 600, fill: MUTED })
  body += `<rect x="${L}" y="${n(sy(d.highC))}" width="${n(R - L)}" height="${n(sy(d.lowC) - sy(d.highC))}" fill="#e3f3e8" opacity="0.85"/>`
  body += text(
    L + 6,
    sy(d.highC) + 14,
    `Labeled range ${fmt(d.lowC)} to ${fmt(d.highC)} °C (${fmt(Math.round(cToF(d.lowC)))} to ${fmt(Math.round(cToF(d.highC)))} °F)`,
    { size: 11, fill: '#0f3d1d', weight: 600 },
  )
  for (const s of spans) {
    const x0 = sx(s.from)
    const w = Math.max(2, sx(s.to) - sx(s.from))
    body += `<rect x="${n(x0)}" y="${top}" width="${n(w)}" height="${n(bottom - top)}" fill="url(#${id})" opacity="0.22"/>`
    body += `<rect x="${n(x0)}" y="${n(bottom - 4)}" width="${n(w)}" height="4" fill="${seriesStyle(1).color}"/>`
    body += text(x0 + w / 2, top + 12, 'EXCURSION', {
      size: 11,
      weight: 700,
      anchor: 'middle',
      fill: seriesStyle(1).color,
    })
  }
  body += `<line x1="${L}" x2="${R}" y1="${bottom}" y2="${bottom}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of sx.ticks(6))
    body += text(sx(t), bottom + 18, fmt(t), { size: 11, anchor: 'middle', fill: MUTED })
  body += text((L + R) / 2, bottom + 36, d.xLabel, { size: 12, anchor: 'middle', fill: MUTED })
  const path = (pts: { x: number; tempC: number }[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${n(sx(p.x))} ${n(sy(p.tempC))}`).join('')
  if (ambient.length) {
    const st = seriesStyle(2)
    body += `<path d="${path(ambient)}" fill="none" stroke="${st.color}" stroke-width="2" stroke-dasharray="${st.dash}"/>`
  }
  const ps = seriesStyle(0)
  body += `<path d="${path(probe)}" fill="none" stroke="${ps.color}" stroke-width="2.5"/>`
  const items = [
    {
      name: `${d.source} (${d.unit})`,
      swatch: (x: number, y: number) =>
        `<line x1="${x}" x2="${x + 24}" y1="${y}" y2="${y}" stroke="${ps.color}" stroke-width="2.5"/>`,
    },
    ...(ambient.length
      ? [
          {
            name: 'Ambient',
            swatch: (x: number, y: number) =>
              `<line x1="${x}" x2="${x + 24}" y1="${y}" y2="${y}" stroke="${seriesStyle(2).color}" stroke-width="2" stroke-dasharray="${seriesStyle(2).dash}"/>`,
          },
        ]
      : []),
    {
      name: 'Excursion (outside the range)',
      swatch: (x: number, y: number) =>
        `<rect x="${x}" y="${y - 6}" width="24" height="12" fill="url(#${id})" opacity="0.5"/>`,
    },
  ]
  body += legend(items, L, bottom + 52, R).svg
  const min = Math.min(...probe.map((p) => p.tempC))
  const max = Math.max(...probe.map((p) => p.tempC))
  const summary =
    `${d.title ?? `${d.unit}: temperature`}: ${d.source.toLowerCase()} for ${d.unit}, labeled range ${fmt(d.lowC)} to ${fmt(d.highC)} °C ` +
    `(${fmt(Math.round(cToF(d.lowC)))} to ${fmt(Math.round(cToF(d.highC)))} °F). Minimum ${fmt(min)} °C (${fmt(cToF(min))} °F), maximum ${fmt(max)} °C (${fmt(cToF(max))} °F). ` +
    (spans.length
      ? `${spans.length} excursion${spans.length > 1 ? 's' : ''}, ${fmt(minutes)} minutes outside the range in total` +
        `, the first from ${clock(spans[0]!.from)} to ${clock(spans[0]!.to)}.`
      : 'No excursion: the readings stay within the range.')
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? `${d.unit}: temperature`,
      summary,
      defs: hatch,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: `${d.unit}: probe readings`,
      columns: [d.xLabel, '°C', '°F', 'State'],
      rows: probe.map((p) => [
        fmt(p.x),
        String(Math.round(p.tempC * 10) / 10),
        String(Math.round(cToF(p.tempC) * 10) / 10),
        p.tempC < d.lowC || p.tempC > d.highC ? 'Out of range' : 'In range',
      ]),
    },
  }
}

export const coldChainChartKind: FigureKind<ColdChainData> = {
  kind: 'pharmacy_cold_chain_chart',
  schema: ColdChainData,
  render: renderColdChain,
  defaultHeight: 400,
}
