// space_xray_flux and space_proton_flux: GOES flux on a log axis with the scale levels as lines
// labeled with their words (R1 to R5 at the X-ray flux, S1 to S5 at the 10 MeV proton flux), and
// the flare classes A to X on the X-ray axis (spec 0468 FR-5).
import { scaleLog } from 'd3-scale'
import { z } from 'zod'
import { rLevelForXray, sLevelForFlux } from '../../../toolkits/space_weather/lint'
import { makeXAxis } from '../axis'
import { frame, heading, n, text } from '../svg'
import { MUTED, seriesStyle } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  IsoTime,
  Title,
  bottomAxis,
  flareClass,
  hashKey,
  leftTicks,
  levelStyle,
  levelText,
  LEVEL_WORDS,
  pathOf,
  simulatedStamp,
  tenPower,
  thin,
  utcShort,
} from './common'

const M = { left: 62, right: 96, bottom: 54 }

interface LevelLine {
  value: number
  label: string
  level: number
}

interface Spec {
  title: string
  yLabel: string
  unit: string
  lines: LevelLine[]
  classLines?: { value: number; label: string }[]
  scale: 'R' | 'S'
  valueText: (v: number) => string
  levelOf: (v: number) => number
  minDomain: number
  maxDomain: number
}

function renderFlux(
  d: { title?: string; points: { time: string; value: number }[]; simulated: boolean },
  spec: Spec,
  o: { width: number; height: number },
): FigureResult {
  const pts = [...d.points].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const values = pts.map((p) => p.value)
  const peakV = Math.max(...values)
  const lo = Math.min(spec.minDomain, 10 ** Math.floor(Math.log10(Math.min(...values))))
  const hi = Math.max(spec.maxDomain, 10 ** Math.ceil(Math.log10(peakV)))
  const top = d.title ? 44 : 22
  const plotB = o.height - M.bottom
  const plotR = o.width - M.right
  const x = makeXAxis(
    pts.map((p) => p.time),
    M.left,
    plotR,
  )
  const y = scaleLog().domain([lo, hi]).range([plotB, top])
  const decades: number[] = []
  for (let e = Math.round(Math.log10(lo)); e <= Math.round(Math.log10(hi)); e++) decades.push(e)

  let body = heading(d.title ?? spec.title, M.left)
  body += leftTicks(
    decades.map((e) => ({ y: y(10 ** e), label: tenPower(e) })),
    M.left,
    plotR,
  )
  body += text(14, (top + plotB) / 2, spec.yLabel, {
    size: 11,
    fill: MUTED,
    extra: `transform="rotate(-90 14 ${n((top + plotB) / 2)})"`,
  })
  for (const c of spec.classLines ?? []) {
    if (c.value < lo || c.value > hi) continue
    body += text(M.left + 6, y(c.value) - 4, c.label, { size: 11, weight: 700, fill: MUTED })
  }
  for (const l of spec.lines) {
    if (l.value < lo || l.value > hi) continue
    const st = levelStyle(l.level)
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(l.value))}" y2="${n(y(l.value))}" stroke="${st.color}" stroke-width="1.6" stroke-dasharray="6 4"/>`
    body += text(plotR + 8, y(l.value) + 4, `${spec.scale}${l.level} ${LEVEL_WORDS[l.level]}`, {
      size: 11,
      weight: 700,
      fill: st.color,
    })
  }
  const s0 = seriesStyle(0)
  body += `<path d="${pathOf(pts.map((p) => [x.position(p.time), y(p.value)]))}" fill="none" stroke="${s0.color}" stroke-width="2.2" stroke-linejoin="round"/>`
  const peak = pts.reduce((a, b) => (b.value > a.value ? b : a))
  body += `<circle cx="${n(x.position(peak.time))}" cy="${n(y(peak.value))}" r="4.5" fill="${s0.color}" stroke="#ffffff"/>`
  body += text(
    Math.min(x.position(peak.time) + 8, plotR - 4),
    y(peak.value) - 8,
    `Peak ${spec.valueText(peak.value)}`,
    { size: 11, weight: 700, anchor: x.position(peak.time) > plotR - 140 ? 'end' : 'start' },
  )
  body += bottomAxis(x, M.left, plotR, plotB)
  if (d.simulated) body += simulatedStamp(o.width - 10, 20)

  const peakLevel = spec.levelOf(peakV)
  const first = pts.find((p) => spec.levelOf(p.value) >= 1)
  const summary =
    `${d.title ?? spec.title}${d.simulated ? ' (simulated)' : ''}: ${pts.length} readings from ${utcShort(pts[0]!.time)} to ${utcShort(pts.at(-1)!.time)}. ` +
    `Peak ${spec.valueText(peakV)} at ${utcShort(peak.time)}, ${levelText(spec.scale, peakLevel)}. ` +
    (first
      ? `The ${spec.scale}1 level was first reached at ${utcShort(first.time)}.`
      : `The ${spec.scale}1 level was not reached.`)
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? spec.title,
      summary,
      body,
      idKey: hashKey(d),
    }),
    summary,
    table: {
      caption: d.title ?? spec.title,
      columns: ['Time', spec.unit, spec.scale === 'R' ? 'Class' : 'Level'],
      rows: thin(pts, 60).map((p) => [
        utcShort(p.time),
        spec.valueText(p.value),
        spec.scale === 'R'
          ? `${flareClass(p.value)} (${levelText('R', spec.levelOf(p.value))})`
          : levelText('S', spec.levelOf(p.value)),
      ]),
    },
  }
}

const sci = (v: number): string => {
  const e = Math.floor(Math.log10(v))
  return `${(v / 10 ** e).toFixed(2)}e${e}`
}

export const XrayFluxData = z.object({
  title: Title,
  /** GOES X-ray flux 0.1 to 0.8 nm in W/m2. */
  points: z
    .array(z.object({ time: IsoTime, flux: z.number().finite().positive() }))
    .min(1)
    .max(3000),
  simulated: z.boolean().default(false),
})
export type XrayFluxData = z.infer<typeof XrayFluxData>

export const xrayFluxKind: FigureKind<XrayFluxData> = {
  kind: 'space_xray_flux',
  schema: XrayFluxData,
  defaultHeight: 400,
  render: (d, o) =>
    renderFlux(
      { ...d, points: d.points.map((p) => ({ time: p.time, value: p.flux })) },
      {
        title: 'GOES X-ray flux',
        yLabel: 'Flux (W/m²)',
        unit: 'Flux (W/m²) and class',
        scale: 'R',
        minDomain: 1e-8,
        maxDomain: 1e-3,
        valueText: (v) => `${sci(v)} W/m² (${flareClass(v)})`,
        levelOf: (v) => {
          const c = flareClass(v)
          return rLevelForXray(c[0]!, Number(c.slice(1)))
        },
        classLines: [
          { value: 1e-8, label: 'A' },
          { value: 1e-7, label: 'B' },
          { value: 1e-6, label: 'C' },
          { value: 1e-5, label: 'M' },
          { value: 1e-4, label: 'X' },
        ],
        lines: [
          { value: 1e-5, label: 'M1', level: 1 },
          { value: 5e-5, label: 'M5', level: 2 },
          { value: 1e-4, label: 'X1', level: 3 },
          { value: 1e-3, label: 'X10', level: 4 },
          { value: 2e-3, label: 'X20', level: 5 },
        ],
      },
      o,
    ),
}

export const ProtonFluxData = z.object({
  title: Title,
  /** GOES integral proton flux at 10 MeV and above, in particle flux units. */
  points: z
    .array(z.object({ time: IsoTime, pfu: z.number().finite().positive() }))
    .min(1)
    .max(3000),
  simulated: z.boolean().default(false),
})
export type ProtonFluxData = z.infer<typeof ProtonFluxData>

export const protonFluxKind: FigureKind<ProtonFluxData> = {
  kind: 'space_proton_flux',
  schema: ProtonFluxData,
  defaultHeight: 400,
  render: (d, o) =>
    renderFlux(
      { ...d, points: d.points.map((p) => ({ time: p.time, value: p.pfu })) },
      {
        title: 'GOES proton flux at 10 MeV and above',
        yLabel: 'Flux (pfu)',
        unit: 'Flux (pfu)',
        scale: 'S',
        minDomain: 1e-1,
        maxDomain: 1e5,
        valueText: (v) => `${v >= 10 ? Math.round(v) : v.toFixed(2)} pfu`,
        levelOf: sLevelForFlux,
        lines: [1, 2, 3, 4, 5].map((l) => ({ value: 10 ** l, label: `S${l}`, level: l })),
      },
      o,
    ),
}
