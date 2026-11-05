// skew_t and hodograph: the two views of an upper-air sounding. The skew-T plots temperature,
// dewpoint and a surface-based parcel on a log-pressure axis with skewed isotherms and wind
// barbs, with the key indices computed from the data; the hodograph plots the wind vector from
// the surface up, with height marks. Both state the values in their summary and table.
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { frame, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { dirSpeed, kinematics, surfaceParcel, windProfile, type SoundingLevel } from './thermo'
import { utcLabel } from './radar'

const Level = z.object({
  pressureHpa: z.number().min(1).max(1100),
  heightM: z.number().min(-500).max(50_000),
  tempC: z.number().min(-120).max(60).optional(),
  dewpointC: z.number().min(-120).max(60).optional(),
  windDirDeg: z.number().min(0).max(360).optional(),
  windSpeedKt: z.number().min(0).max(250).optional(),
})

export const SoundingData = z.object({
  title: z.string().max(200).optional(),
  origin: z.enum(['historical', 'simulated']),
  station: z.object({ id: z.string().min(2).max(8), name: z.string().max(80).optional() }),
  /** Launch time, ISO 8601. */
  time: z.iso.datetime({ offset: true }),
  levels: z.array(Level).min(5).max(600),
})
export type SoundingData = z.infer<typeof SoundingData>

const km = (m: number): string => `${(m / 1000).toFixed(1)} km`
const heading = (d: SoundingData, what: string): string =>
  `${what}, ${d.station.id}${d.station.name ? ` ${d.station.name}` : ''}, ${utcLabel(d.time)}, ${d.origin} data`

interface Indices {
  rows: string[][]
  sentences: string[]
}

function indices(d: SoundingData): Indices {
  const lv = d.levels as SoundingLevel[]
  const parcel = surfaceParcel(lv)
  const kin = kinematics(lv)
  const rows: string[][] = []
  const sentences: string[] = []
  if (parcel) {
    rows.push(
      ['Surface-based CAPE', `${parcel.cape} J/kg`],
      ['Surface-based CIN', `${parcel.cin} J/kg`],
      ['Lifted condensation level', `${km(parcel.lclHeightAglM)} above ground`],
      [
        'Level of free convection',
        parcel.lfcHeightAglM === undefined ? 'none' : `${km(parcel.lfcHeightAglM)} above ground`,
      ],
      [
        'Equilibrium level',
        parcel.elHeightAglM === undefined ? 'none' : `${km(parcel.elHeightAglM)} above ground`,
      ],
    )
    sentences.push(
      `A surface-based parcel has ${parcel.cape} J/kg of CAPE and ${parcel.cin} J/kg of CIN; its lifted condensation level is ${km(parcel.lclHeightAglM)} above ground` +
        (parcel.lfcHeightAglM === undefined
          ? ' and it never becomes buoyant.'
          : `, its level of free convection ${km(parcel.lfcHeightAglM)}${parcel.elHeightAglM === undefined ? '.' : ` and its equilibrium level ${km(parcel.elHeightAglM)}.`}`),
    )
  }
  if (kin) {
    const sm = dirSpeed(kin.stormMotion.u, kin.stormMotion.v)
    rows.push(
      ['0 to 6 km bulk shear', `${kin.shear06Kt} kt`],
      ['0 to 1 km bulk shear', `${kin.shear01Kt} kt`],
      ['0 to 3 km storm-relative helicity', `${kin.srh03} m2/s2`],
      ['0 to 1 km storm-relative helicity', `${kin.srh01} m2/s2`],
      [
        'Right-moving storm motion (Bunkers)',
        `from ${String(sm.dirDeg).padStart(3, '0')} degrees at ${Math.round(sm.speedKt)} kt`,
      ],
    )
    sentences.push(
      `Bulk shear is ${kin.shear06Kt} kt over 0 to 6 km and ${kin.shear01Kt} kt over 0 to 1 km; storm-relative helicity is ${kin.srh03} m2/s2 over 0 to 3 km and ${kin.srh01} m2/s2 over 0 to 1 km, using a Bunkers right-moving storm motion from ${String(sm.dirDeg).padStart(3, '0')} degrees at ${Math.round(sm.speedKt)} kt.`,
    )
  } else
    sentences.push(
      'The sounding does not have winds up to 6 km, so shear and helicity are not computed.',
    )
  return { rows, sentences }
}

// ---- skew-T ---------------------------------------------------------------------------------

const P_BOTTOM = 1050
const P_TOP = 100
const T_MIN = -30
const KX = 5
const SKEW = 0.6

/** Wind barb at (x, y): the staff points into the wind, feathers on its left (northern hemisphere). */
function barb(x: number, y: number, dirDeg: number, speedKt: number): string {
  const sp = Math.round(speedKt / 5) * 5
  if (sp < 5)
    return `<circle cx="${n(x)}" cy="${n(y)}" r="3" fill="none" stroke="${INK}" stroke-width="1"/>`
  const rad = (dirDeg * Math.PI) / 180
  const sx = Math.sin(rad)
  const sy = -Math.cos(rad)
  const L = 26
  const fx = -sy
  const fy = sx
  let d = `M${n(x)} ${n(y)}L${n(x + sx * L)} ${n(y + sy * L)}`
  let left = sp
  let at = L
  const pt = (t: number) => [x + sx * t, y + sy * t] as const
  while (left >= 50) {
    const [a, b] = pt(at)
    const [c, e] = pt(at - 5)
    d += `M${n(a)} ${n(b)}L${n(a + fx * 10)} ${n(b + fy * 10)}L${n(c)} ${n(e)}Z`
    at -= 6
    left -= 50
  }
  while (left >= 10) {
    const [a, b] = pt(at)
    d += `M${n(a)} ${n(b)}L${n(a + fx * 10)} ${n(b + fy * 10)}`
    at -= 4
    left -= 10
  }
  if (left >= 5) {
    const [a, b] = pt(at === L ? at - 4 : at)
    d += `M${n(a)} ${n(b)}L${n(a + fx * 5)} ${n(b + fy * 5)}`
  }
  return `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`
}

function renderSkewT(d: SoundingData, o: { width: number; height: number }): FigureResult {
  const ind = indices(d)
  const lv = d.levels as SoundingLevel[]
  const parcel = surfaceParcel(lv)
  const left = 46
  const top = d.title ? 36 : 14
  const plotH = Math.min(o.height - top - 50, 520)
  const plotW = 480
  const yOf = (p: number): number =>
    top +
    ((Math.log(P_BOTTOM) - Math.log(p)) / (Math.log(P_BOTTOM) - Math.log(P_TOP))) * -plotH +
    plotH
  const xOf = (t: number, p: number): number =>
    left + (t - T_MIN) * KX + (top + plotH - yOf(p)) * SKEW
  const clipId = 'skc' + d.station.id
  let body = d.title ? text(16, 22, d.title, { size: 15, weight: 700 }) : ''
  body += `<rect x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="#ffffff" stroke="${INK}"/>`
  body += `<g clip-path="url(#${clipId})">`
  for (let t = -120; t <= 50; t += 10) {
    const warm = t === 0
    body += `<path d="M${n(xOf(t, P_BOTTOM))} ${n(yOf(P_BOTTOM))}L${n(xOf(t, P_TOP))} ${n(yOf(P_TOP))}" stroke="${warm ? '#6f7b87' : '#c9d0d8'}" stroke-width="${warm ? 1.4 : 0.8}" fill="none"/>`
  }
  for (const theta of [260, 280, 300, 320, 340, 360, 380, 400, 440]) {
    let path = ''
    for (let p = P_BOTTOM; p >= P_TOP; p -= 25) {
      const t = theta * Math.pow(p / 1000, 0.2854) - 273.15
      path += `${path ? 'L' : 'M'}${n(xOf(t, p))} ${n(yOf(p))}`
    }
    body += `<path d="${path}" stroke="#d8b9a4" stroke-width="0.8" stroke-dasharray="4 3" fill="none"/>`
  }
  for (const p of [1000, 850, 700, 500, 400, 300, 250, 200, 150, 100])
    body += `<path d="M${left} ${n(yOf(p))}H${left + plotW}" stroke="#8a96a3" stroke-width="0.9"/>`
  const line = (pick: (l: SoundingLevel) => number | undefined): string => {
    const pts = lv
      .filter((l) => pick(l) !== undefined)
      .sort((a, b) => b.pressureHpa - a.pressureHpa)
    return pts
      .map((l, i) => `${i ? 'L' : 'M'}${n(xOf(pick(l)!, l.pressureHpa))} ${n(yOf(l.pressureHpa))}`)
      .join('')
  }
  if (parcel)
    body += `<path d="${parcel.profile.map((q, i) => `${i ? 'L' : 'M'}${n(xOf(q.tempC, q.pressureHpa))} ${n(yOf(q.pressureHpa))}`).join('')}" stroke="${INK}" stroke-width="1.6" stroke-dasharray="7 4" fill="none"/>`
  body += `<path d="${line((l) => l.dewpointC)}" stroke="#1b7a3a" stroke-width="2.6" stroke-dasharray="2 3" stroke-linecap="round" fill="none"/>`
  body += `<path d="${line((l) => l.tempC)}" stroke="#b3121b" stroke-width="2.6" fill="none"/>`
  body += `</g>`
  for (const p of [1000, 850, 700, 500, 300, 200, 100])
    body += text(left - 6, yOf(p) + 4, String(p), { size: 11, anchor: 'end', fill: MUTED })
  body += text(left - 6, top - 3, 'hPa', { size: 10, anchor: 'end', fill: MUTED })
  for (let t = -30; t <= 40; t += 10)
    body += text(xOf(t, P_BOTTOM), top + plotH + 14, String(t), {
      size: 11,
      anchor: 'middle',
      fill: MUTED,
    })
  body += text(left + plotW / 2, top + plotH + 30, 'Temperature (C)', {
    size: 11,
    anchor: 'middle',
    fill: MUTED,
  })
  // winds
  const wx = left + plotW + 22
  let lastBarbY = Infinity
  for (const l of [...lv].sort((a, b) => b.pressureHpa - a.pressureHpa))
    if (
      l.windDirDeg !== undefined &&
      l.windSpeedKt !== undefined &&
      l.pressureHpa >= 200 &&
      l.pressureHpa <= 1000
    ) {
      const by = yOf(l.pressureHpa)
      if (lastBarbY - by < 30) continue
      lastBarbY = by
      body += barb(wx, by, l.windDirDeg, l.windSpeedKt)
    }
  body += `<defs></defs>`
  // level marks
  const marks: [string, number | undefined][] = parcel
    ? [
        ['LCL', parcel.lclPressureHpa],
        ['LFC', parcel.lfcPressureHpa],
        ['EL', parcel.elPressureHpa],
      ]
    : []
  let lastMarkY = Infinity
  for (const [label, p] of marks)
    if (p !== undefined) {
      let my = yOf(p)
      if (lastMarkY - my < 14) my = lastMarkY - 14
      lastMarkY = my
      body += `<path d="M${left + plotW - 30} ${n(my)}H${left + plotW}" stroke="${INK}" stroke-width="2"/>${text(left + plotW - 34, my + 4, label, { size: 11, weight: 700, anchor: 'end' })}`
    }
  // info box
  const bx = wx + 40
  body += text(bx, top + 8, 'Indices', { size: 13, weight: 700 })
  ind.rows.forEach((r, i) => {
    body += text(bx, top + 28 + i * 34, r[0]!, { size: 10.5, fill: MUTED })
    body += text(bx, top + 42 + i * 34, r[1]!, { size: 12, weight: 600 })
  })
  const lx = bx
  const ly = top + 36 + ind.rows.length * 34 + 10
  body += `<path d="M${lx} ${ly}h26" stroke="#b3121b" stroke-width="2.6"/>${text(lx + 32, ly + 4, 'Temperature', { size: 11, fill: MUTED })}`
  body += `<path d="M${lx} ${ly + 18}h26" stroke="#1b7a3a" stroke-width="2.6" stroke-dasharray="2 3"/>${text(lx + 32, ly + 22, 'Dewpoint', { size: 11, fill: MUTED })}`
  body += `<path d="M${lx} ${ly + 36}h26" stroke="${INK}" stroke-width="1.6" stroke-dasharray="7 4"/>${text(lx + 32, ly + 40, 'Surface parcel', { size: 11, fill: MUTED })}`
  const originWord = d.origin === 'historical' ? 'Historical data' : 'Simulated data'
  body += text(
    left,
    top + plotH + 46,
    `${d.station.id} ${utcLabel(d.time)} · ${originWord} · exercise figure`,
    { size: 11, fill: MUTED },
  )
  const defs = `<clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${plotW}" height="${plotH}"/></clipPath>`
  const summary = `Skew-T log-p diagram from ${heading(d, 'sounding')}. ${ind.sentences.join(' ')} Temperature is the solid line, dewpoint the dotted line and the surface-based parcel the dashed line; wind barbs are on the right.`
  const levelsWithT = lv.filter((l) => l.tempC !== undefined)
  const table = {
    caption: heading(d, 'Sounding indices'),
    columns: ['Index', 'Value'],
    rows: [...ind.rows, ['Temperature levels', String(levelsWithT.length)]],
  }
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: heading(d, 'Skew-T'),
      summary,
      defs,
      body,
      idKey: `skt${d.station.id}${d.time}`,
    }),
    summary,
    table,
  }
}

export const skewTKind: FigureKind<SoundingData> = {
  kind: 'skew_t',
  schema: SoundingData,
  render: renderSkewT,
  defaultHeight: 640,
}

// ---- hodograph ------------------------------------------------------------------------------

const BANDS: {
  from: number
  to: number
  color: string
  dash: string | undefined
  label: string
}[] = [
  { from: 0, to: 1000, color: '#b3121b', dash: undefined, label: '0 to 1 km' },
  { from: 1000, to: 3000, color: '#1b7a3a', dash: '7 4', label: '1 to 3 km' },
  { from: 3000, to: 6000, color: '#1f5fbf', dash: '2 3', label: '3 to 6 km' },
  { from: 6000, to: 9000, color: '#6d3fb5', dash: '10 3 2 3', label: '6 to 9 km' },
]

function renderHodograph(d: SoundingData, o: { width: number; height: number }): FigureResult {
  const lv = d.levels as SoundingLevel[]
  const w = windProfile(lv).filter((x) => x.zAglM <= 9000)
  const kin = kinematics(lv)
  const toKt = (ms: number): number => ms / 0.514444
  const maxKt = Math.max(30, ...w.map((x) => Math.hypot(toKt(x.u), toKt(x.v))))
  const ringMax = Math.ceil(maxKt / 10) * 10
  const S = Math.min(o.width - 230, o.height - (d.title ? 70 : 50))
  const x0 = 24
  const y0 = d.title ? 40 : 18
  const c = S / 2
  const sc = (kt: number): number => (kt / ringMax) * c
  let body = d.title ? text(16, 22, d.title, { size: 15, weight: 700 }) : ''
  body += `<rect x="${x0}" y="${y0}" width="${S}" height="${S}" fill="#ffffff" stroke="${INK}"/>`
  for (let r = 10; r <= ringMax; r += 10) {
    body += `<circle cx="${n(x0 + c)}" cy="${n(y0 + c)}" r="${n(sc(r))}" fill="none" stroke="#c9d0d8" stroke-width="0.9"/>`
    body += text(x0 + c + 3, y0 + c - sc(r) + 11, `${r}`, { size: 10, fill: MUTED })
  }
  body += `<path d="M${x0} ${n(y0 + c)}H${x0 + S}M${n(x0 + c)} ${y0}V${y0 + S}" stroke="#6f7b87" stroke-width="1"/>`
  const P = (u: number, v: number): [number, number] => [x0 + c + sc(toKt(u)), y0 + c - sc(toKt(v))]
  for (const b of BANDS) {
    const pts: [number, number][] = []
    const seg = w.filter((x) => x.zAglM >= b.from && x.zAglM <= b.to)
    const before = [...w].reverse().find((x) => x.zAglM < b.from)
    if (before && seg[0]) pts.push(P(before.u, before.v))
    seg.forEach((x) => pts.push(P(x.u, x.v)))
    if (pts.length > 1)
      body += `<path d="M${pts.map((p) => `${n(p[0])} ${n(p[1])}`).join('L')}" fill="none" stroke="${b.color}" stroke-width="3" ${b.dash ? `stroke-dasharray="${b.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`
  }
  for (const km of [1, 3, 6, 9]) {
    const near = [...w].sort(
      (a, b) => Math.abs(a.zAglM - km * 1000) - Math.abs(b.zAglM - km * 1000),
    )[0]
    if (!near || Math.abs(near.zAglM - km * 1000) > 700) continue
    const [mx, my] = P(near.u, near.v)
    body += `<circle cx="${n(mx)}" cy="${n(my)}" r="9" fill="#ffffff" stroke="${INK}" stroke-width="1.2"/>${text(mx, my + 4, String(km), { size: 11, weight: 700, anchor: 'middle' })}`
  }
  if (kin) {
    const [sx, sy] = P(kin.stormMotion.u, kin.stormMotion.v)
    body += `<path d="M${n(sx - 6)} ${n(sy - 6)}L${n(sx + 6)} ${n(sy + 6)}M${n(sx + 6)} ${n(sy - 6)}L${n(sx - 6)} ${n(sy + 6)}" stroke="${INK}" stroke-width="2.4"/>${text(sx + 9, sy - 6, 'Storm motion', { size: 11, weight: 600 })}`
  }
  const lx = x0 + S + 20
  body += text(lx, y0 + 10, 'Height above ground', { size: 12, weight: 700 })
  BANDS.forEach((b, i) => {
    body += `<path d="M${lx} ${y0 + 30 + i * 22}h30" stroke="${b.color}" stroke-width="3" ${b.dash ? `stroke-dasharray="${b.dash}"` : ''}/>${text(lx + 38, y0 + 34 + i * 22, b.label, { size: 11, fill: MUTED })}`
  })
  const rows: string[][] = []
  const sentences: string[] = []
  if (kin) {
    const sm = dirSpeed(kin.stormMotion.u, kin.stormMotion.v)
    rows.push(
      ['0 to 6 km bulk shear', `${kin.shear06Kt} kt`],
      ['0 to 3 km storm-relative helicity', `${kin.srh03} m2/s2`],
      ['0 to 1 km storm-relative helicity', `${kin.srh01} m2/s2`],
    )
    sentences.push(
      `Bulk shear 0 to 6 km is ${kin.shear06Kt} kt; storm-relative helicity is ${kin.srh03} m2/s2 over 0 to 3 km and ${kin.srh01} m2/s2 over 0 to 1 km; the Bunkers right-moving storm motion is from ${String(sm.dirDeg).padStart(3, '0')} degrees at ${Math.round(sm.speedKt)} kt.`,
    )
    body += text(lx, y0 + 150, `0 to 6 km shear ${kin.shear06Kt} kt`, { size: 12 })
    body += text(lx, y0 + 170, `SRH 0 to 3 km ${kin.srh03} m2/s2`, { size: 12 })
    body += text(lx, y0 + 190, `SRH 0 to 1 km ${kin.srh01} m2/s2`, { size: 12 })
  }
  const first = w[0]
  const top9 = w[w.length - 1]
  if (first && top9) {
    const a = dirSpeed(first.u, first.v)
    const b = dirSpeed(top9.u, top9.v)
    rows.push(
      [
        'Surface wind',
        `from ${String(a.dirDeg).padStart(3, '0')} degrees at ${Math.round(a.speedKt)} kt`,
      ],
      [
        `Wind at ${km(top9.zAglM)}`,
        `from ${String(b.dirDeg).padStart(3, '0')} degrees at ${Math.round(b.speedKt)} kt`,
      ],
    )
    sentences.push(
      `The wind turns from ${String(a.dirDeg).padStart(3, '0')} degrees at ${Math.round(a.speedKt)} kt near the surface to ${String(b.dirDeg).padStart(3, '0')} degrees at ${Math.round(b.speedKt)} kt at ${km(top9.zAglM)}.`,
    )
  }
  body += text(
    x0,
    y0 + S + 18,
    `${d.station.id} ${utcLabel(d.time)} · ${d.origin === 'historical' ? 'Historical data' : 'Simulated data'} · rings every 10 kt · exercise figure`,
    { size: 11, fill: MUTED },
  )
  const summary = `Hodograph from ${heading(d, 'sounding')}. ${sentences.join(' ')} Height marks are at 1, 3, 6 and 9 km above ground.`
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: heading(d, 'Hodograph'),
      summary,
      body,
      idKey: `hod${d.station.id}${d.time}`,
    }),
    summary,
    table: { caption: heading(d, 'Hodograph values'), columns: ['Measure', 'Value'], rows },
  }
}

export const hodographKind: FigureKind<SoundingData> = {
  kind: 'hodograph',
  schema: SoundingData,
  render: renderHodograph,
  defaultHeight: 520,
}
