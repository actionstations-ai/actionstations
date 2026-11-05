// The storm model behind the simulated convective event (spec 0449 FR-8): a parametric cell
// that moves in a straight line, drawn as reflectivity, radial velocity and correlation
// coefficient on a radar's polar grid. No numerical weather model: a supercell is a core with a
// hook echo and a rotating mesocyclone, a line is a bowed arc with a leading outflow, a
// multicell is three cores. Everything is a pure function of the parameters, so the same
// parameters give the same frames.
import { packPolar, type PolarField } from '../../render/figures/weather/polar'

export type StormMode = 'supercell' | 'line' | 'multicell'

export interface StormParams {
  mode: StormMode
  /** Azimuth and range from the radar to the storm at the start, degrees and km. */
  startBearingDeg: number
  startRangeKm: number
  /** Direction the storm moves from, degrees, and speed in knots. */
  motionFromDeg: number
  speedKt: number
  peakDbz: number
  tornado?: { startMin: number; endMin: number } | undefined
  seed: number
}

export const KM_PER_KT_MIN = 1.852 / 60

const rad = (d: number): number => (d * Math.PI) / 180

/** Position of the storm center in km east and north of the radar after `minutes`. */
export function stormCenter(p: StormParams, minutes: number): { x: number; y: number } {
  const to = rad((p.motionFromDeg + 180) % 360)
  const d = p.speedKt * KM_PER_KT_MIN * minutes
  return {
    x: p.startRangeKm * Math.sin(rad(p.startBearingDeg)) + d * Math.sin(to),
    y: p.startRangeKm * Math.cos(rad(p.startBearingDeg)) + d * Math.cos(to),
  }
}

/** Deterministic noise in [0, 1) from integers (a small integer hash). */
export function noise(a: number, b: number, c: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^
    Math.imul(c + 0x165667b1, 0x27d4eb2f)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return ((h >>> 0) % 100000) / 100000
}

interface Sample {
  dbz: number
  /** m/s, positive away from the radar; undefined where there is no echo. */
  vr: number | undefined
  cc: number | undefined
}

/** Storm-frame coordinates of a point: `a` along the motion, `b` to the left of it. */
function stormFrame(p: StormParams, cx: number, cy: number, x: number, y: number) {
  const to = rad((p.motionFromDeg + 180) % 360)
  const dx = x - cx
  const dy = y - cy
  const a = dx * Math.sin(to) + dy * Math.cos(to)
  const b = -dx * Math.cos(to) + dy * Math.sin(to)
  return { dx, dy, a, b }
}

const gauss = (d2: number, sigma: number): number => Math.exp(-d2 / (2 * sigma * sigma))

/** Reflectivity (dBZ) at a storm-frame point. */
function reflectivity(p: StormParams, a: number, b: number): { dbz: number; core: number } {
  let g: number
  if (p.mode === 'supercell') {
    const core = gauss(a * a + b * b, 6.5)
    const hook = 0.92 * gauss((a + 7) ** 2 + (b + 4.5) ** 2, 3.2)
    const flank = 0.55 * gauss((a - 9) ** 2 * 0.5 + (b - 2) ** 2, 12)
    g = Math.max(core, hook, flank)
  } else if (p.mode === 'line') {
    const apex = a + 0.005 * b * b
    g =
      gauss(apex * apex, 4.5) * gauss(b * b, 38) +
      0.35 * gauss((apex + 12) ** 2, 9) * gauss(b * b, 50)
  } else {
    const cells = [
      { a: 0, b: 0, w: 1 },
      { a: -9, b: 11, w: 0.82 },
      { a: 7, b: -12, w: 0.7 },
    ]
    g = Math.max(...cells.map((c) => c.w * gauss((a - c.a) ** 2 + (b - c.b) ** 2, 4.5)))
  }
  return { dbz: -12 + (p.peakDbz + 12) * Math.min(1, g), core: g }
}

/** Wind at a storm-frame point as east/north components (m/s), before the radar looks at it. */
function wind(
  p: StormParams,
  minute: number,
  x: number,
  y: number,
  cx: number,
  cy: number,
  a: number,
  core: number,
) {
  const to = rad((p.motionFromDeg + 180) % 360)
  const base = p.speedKt * 0.514444 * 1.1
  let u = base * Math.sin(to)
  let v = base * Math.cos(to)
  if (p.mode === 'supercell') {
    // The mesocyclone sits just behind the core center, and tightens when the tornado begins.
    const m = { x: cx - 1.5 * Math.sin(to), y: cy - 1.5 * Math.cos(to) }
    const dx = x - m.x
    const dy = y - m.y
    const r = Math.hypot(dx, dy) || 0.001
    const t = p.tornado
    const ramp = t ? Math.min(1, Math.max(0, (minute - (t.startMin - 25)) / 25)) : 0.35
    const vmax = (t && minute > t.endMin + 5 ? 12 : 12 + 20 * ramp) * 1
    const rc = 2.2
    const vt = r < rc ? (vmax * r) / rc : vmax * (rc / r) ** 0.8
    if (r < 25) {
      u += (-dy / r) * vt
      v += (dx / r) * vt
    }
  } else if (p.mode === 'line') {
    // Outflow ahead of the line along its motion, strongest near the apex.
    const out = 18 * core * (a > -6 ? 1 : 0.3)
    u += out * Math.sin(to)
    v += out * Math.cos(to)
  }
  return { u, v }
}

/** One gate of the radar's view at `minute`: reflectivity, radial velocity and correlation coefficient. */
export function sampleGate(p: StormParams, minute: number, azDeg: number, rangeKm: number): Sample {
  const x = rangeKm * Math.sin(rad(azDeg))
  const y = rangeKm * Math.cos(rad(azDeg))
  const c = stormCenter(p, minute)
  const f = stormFrame(p, c.x, c.y, x, y)
  const { dbz: clean, core } = reflectivity(p, f.a, f.b)
  const n = noise(Math.round(azDeg * 4), Math.round(rangeKm * 4), p.seed + Math.round(minute))
  const dbz = clean + (n - 0.5) * (clean > 15 ? 5 : 8)
  if (dbz < 5) return { dbz, vr: undefined, cc: undefined }
  const w = wind(p, minute, x, y, c.x, c.y, f.a, core)
  const vr =
    w.u * Math.sin(rad(azDeg)) +
    w.v * Math.cos(rad(azDeg)) +
    (noise(Math.round(azDeg), Math.round(rangeKm * 2), p.seed + 7) - 0.5) * 2
  let cc = dbz < 15 ? 0.9 : dbz > 55 && p.mode === 'supercell' ? 0.93 : 0.97
  cc += (noise(Math.round(azDeg * 2), Math.round(rangeKm), p.seed + 3) - 0.5) * 0.02
  const t = p.tornado
  if (t && minute >= t.startMin && minute <= t.endMin) {
    const to = rad((p.motionFromDeg + 180) % 360)
    const tx = c.x - 1.5 * Math.sin(to)
    const ty = c.y - 1.5 * Math.cos(to)
    const dist = Math.hypot(x - tx, y - ty)
    if (dist < 2)
      cc = 0.62 + 0.1 * dist + (noise(Math.round(x * 10), Math.round(y * 10), p.seed) - 0.5) * 0.08
  }
  return { dbz, vr, cc: Math.min(1.04, Math.max(0.2, cc)) }
}

export interface PolarGeometry {
  azimuths: number[]
  gates: number
  firstGateM: number
  gateSpacingM: number
}

export const polarGeometry = (extentKm: number, radialSpacingDeg = 1): PolarGeometry => ({
  azimuths: Array.from(
    { length: Math.round(360 / radialSpacingDeg) },
    (_, i) => Math.round(i * radialSpacingDeg * 10) / 10,
  ),
  gates: Math.floor((extentKm * 1000 - 2125) / 250) + 1,
  firstGateM: 2125,
  gateSpacingM: 250,
})

export interface StormFields {
  reflectivity: PolarField
  velocity: PolarField
  correlation: PolarField
}

/** The three moments of one scan, quantized the way the radar does (REF scale 2 offset 66, VEL scale 2 offset 129, RHO scale 300 offset -60.5). */
export function stormScan(p: StormParams, minute: number, geo: PolarGeometry): StormFields {
  const n = geo.azimuths.length * geo.gates
  const ref = new Uint8Array(n)
  const vel = new Uint8Array(n)
  const rho = new Uint8Array(n)
  geo.azimuths.forEach((az, r) => {
    for (let g = 0; g < geo.gates; g++) {
      const s = sampleGate(p, minute, az, (geo.firstGateM + g * geo.gateSpacingM) / 1000)
      const at = r * geo.gates + g
      if (s.dbz < 5) continue
      ref[at] = Math.min(255, Math.max(2, Math.round(s.dbz * 2 + 66)))
      if (s.vr !== undefined) vel[at] = Math.min(255, Math.max(2, Math.round(s.vr * 2 + 129)))
      if (s.cc !== undefined) rho[at] = Math.min(255, Math.max(2, Math.round(s.cc * 300 - 60.5)))
    }
  })
  const meta = (scale: number, offset: number) => ({
    azimuthsDeg: geo.azimuths,
    gates: geo.gates,
    firstGateM: geo.firstGateM,
    gateSpacingM: geo.gateSpacingM,
    scale,
    offset,
  })
  return {
    reflectivity: packPolar(meta(2, 66), ref),
    velocity: packPolar(meta(2, 129), vel),
    correlation: packPolar(meta(300, -60.5), rho),
  }
}
