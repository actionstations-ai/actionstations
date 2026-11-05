// Sounding thermodynamics and kinematics for the skew-T and hodograph figures: a
// surface-based parcel (dry ascent to the lifted condensation level, then a pseudo-adiabat,
// virtual temperature throughout), CAPE and CIN, the levels of free convection and
// equilibrium, bulk shear, and storm-relative helicity with the Bunkers right-moving storm
// motion. Formulas follow Bolton (1980) and Bunkers et al. (2000). Pure functions. These are
// teaching-grade values (they will differ by a few percent from an operational package that
// uses a different parcel or interpolation), and the figure says what it computed.

const RD = 287.04
const CP = 1005.7
const LV = 2.501e6
const EPS = 0.622
const G = 9.80665
const KAPPA = RD / CP

export interface SoundingLevel {
  pressureHpa: number
  heightM: number
  tempC?: number | undefined
  dewpointC?: number | undefined
  windDirDeg?: number | undefined
  windSpeedKt?: number | undefined
}

/** Saturation vapor pressure over water, hPa (Bolton 1980). */
export const satVaporPressure = (tC: number): number =>
  6.112 * Math.exp((17.67 * tC) / (tC + 243.5))

/** Mixing ratio, kg/kg, from vapor pressure and pressure (hPa). */
export const mixingRatio = (e: number, p: number): number => (EPS * e) / (p - e)

const virtual = (tK: number, w: number): number => tK * (1 + 0.61 * w)

/** Lifted condensation level temperature (K) and pressure (hPa) for a surface parcel. */
export function lcl(tC: number, tdC: number, p: number): { tK: number; p: number } {
  const t = tC + 273.15
  const td = Math.min(tdC, tC) + 273.15
  const tl = 1 / (1 / (td - 56) + Math.log(t / td) / 800) + 56
  return { tK: tl, p: p * Math.pow(tl / t, 1 / KAPPA) }
}

/** Temperature (K) after lifting a saturated parcel from (tK, p) to p2 along a pseudo-adiabat. */
export function moistLift(tK: number, p: number, p2: number): number {
  const step = p2 < p ? -1 : 1
  let t = tK
  let pp = p
  while ((p2 - pp) * step > 0) {
    const dp = Math.abs(p2 - pp) < 1 ? p2 - pp : step
    const es = satVaporPressure(t - 273.15)
    const rs = mixingRatio(es, pp)
    const dTdp = (RD * t + LV * rs) / (pp * (CP + (LV * LV * rs * EPS) / (RD * t * t)))
    t += dTdp * dp
    pp += dp
  }
  return t
}

export interface Parcel {
  lclPressureHpa: number
  lclHeightAglM: number
  lfcHeightAglM?: number
  elHeightAglM?: number
  lfcPressureHpa?: number
  elPressureHpa?: number
  /** J/kg */
  cape: number
  /** J/kg, a negative number or zero */
  cin: number
  /** Parcel temperature (C) at each env pressure of `profile`. */
  profile: { pressureHpa: number; tempC: number }[]
}

interface ThermoLevel {
  p: number
  tK: number
  w: number
}

function thermoLevels(levels: readonly SoundingLevel[]): (ThermoLevel & { z: number })[] {
  return levels
    .filter((l) => l.tempC !== undefined)
    .sort((a, b) => b.pressureHpa - a.pressureHpa)
    .map((l) => ({
      p: l.pressureHpa,
      tK: l.tempC! + 273.15,
      w:
        l.dewpointC === undefined
          ? 0
          : mixingRatio(satVaporPressure(Math.min(l.dewpointC, l.tempC!)), l.pressureHpa),
      z: l.heightM,
    }))
}

/** Linear interpolation of a quantity in ln p. */
function interp(levels: ThermoLevel[], p: number, pick: (l: ThermoLevel) => number): number {
  for (let i = 0; i + 1 < levels.length; i++) {
    const a = levels[i]!
    const b = levels[i + 1]!
    if (p <= a.p && p >= b.p) {
      const f = Math.log(a.p / p) / Math.log(a.p / b.p)
      return pick(a) + f * (pick(b) - pick(a))
    }
  }
  return pick(p > levels[0]!.p ? levels[0]! : levels[levels.length - 1]!)
}

/** Surface-based parcel; undefined when the sounding has fewer than three temperature levels. */
export function surfaceParcel(levels: readonly SoundingLevel[]): Parcel | undefined {
  const env = thermoLevels(levels)
  if (env.length < 3) return undefined
  const sfc = env[0]!
  const sfcTdC = levels.find((l) => l.pressureHpa === sfc.p)?.dewpointC ?? sfc.tK - 273.15 - 5
  const lc = lcl(sfc.tK - 273.15, sfcTdC, sfc.p)
  const wParcel = sfc.w || mixingRatio(satVaporPressure(sfcTdC), sfc.p)
  const top = Math.max(100, env[env.length - 1]!.p)
  const profile: Parcel['profile'] = []
  let cape = 0
  let cin = 0
  let z = sfc.z
  let lfc: { p: number; z: number } | undefined
  let el: { p: number; z: number } | undefined
  let prevBuoy = 0
  let prevP = sfc.p
  let prevTvE = virtual(sfc.tK, sfc.w)
  let prevTvP = virtual(sfc.tK, wParcel)
  let prevZ = z
  for (let p = sfc.p - 5; p >= top; p -= 5) {
    const tE = interp(env, p, (l) => l.tK)
    const wE = interp(env, p, (l) => l.w)
    const tvE = virtual(tE, wE)
    const tP = p >= lc.p ? sfc.tK * Math.pow(p / sfc.p, KAPPA) : moistLift(lc.tK, lc.p, p)
    const wP = p >= lc.p ? wParcel : mixingRatio(satVaporPressure(tP - 273.15), p)
    const tvP = virtual(tP, wP)
    z += ((RD * (prevTvE + tvE)) / 2 / G) * Math.log(prevP / p)
    const buoy = (G * (tvP - tvE)) / tvE
    const dz = z - prevZ
    const layer = ((prevBuoy + buoy) / 2) * dz
    if (p < lc.p || tvP > tvE) {
      if (layer > 0) cape += layer
      else if (!lfc) cin += layer
    }
    if (!lfc && p <= lc.p && tvP > tvE) lfc = { p, z }
    if (lfc && tvP <= tvE && prevTvP > prevTvE) el = { p, z }
    profile.push({ pressureHpa: p, tempC: tP - 273.15 })
    prevBuoy = buoy
    prevP = p
    prevTvE = tvE
    prevTvP = tvP
    prevZ = z
  }
  if (!lfc) cape = 0
  const lclZ =
    sfc.z +
    ((RD * ((virtual(sfc.tK, sfc.w) + virtual(lc.tK, wParcel)) / 2)) / G) * Math.log(sfc.p / lc.p)
  return {
    lclPressureHpa: lc.p,
    lclHeightAglM: lclZ - sfc.z,
    ...(lfc ? { lfcHeightAglM: lfc.z - sfc.z, lfcPressureHpa: lfc.p } : {}),
    ...(el ? { elHeightAglM: el.z - sfc.z, elPressureHpa: el.p } : {}),
    cape: Math.round(cape),
    cin: lfc ? Math.round(cin) : 0,
    profile,
  }
}

const KT_TO_MS = 0.514444

export interface Wind {
  zAglM: number
  /** m/s, east and north components */
  u: number
  v: number
}

/** Winds as u,v (m/s) by height above the lowest level, sorted by height. */
export function windProfile(levels: readonly SoundingLevel[]): Wind[] {
  const sfcZ = Math.min(...levels.map((l) => l.heightM))
  return levels
    .filter((l) => l.windDirDeg !== undefined && l.windSpeedKt !== undefined)
    .map((l) => {
      const rad = (l.windDirDeg! * Math.PI) / 180
      const s = l.windSpeedKt! * KT_TO_MS
      return { zAglM: l.heightM - sfcZ, u: -s * Math.sin(rad), v: -s * Math.cos(rad) }
    })
    .sort((a, b) => a.zAglM - b.zAglM)
}

function windAt(w: Wind[], z: number): { u: number; v: number } {
  if (z <= w[0]!.zAglM) return { u: w[0]!.u, v: w[0]!.v }
  for (let i = 0; i + 1 < w.length; i++) {
    const a = w[i]!
    const b = w[i + 1]!
    if (z >= a.zAglM && z <= b.zAglM) {
      const f = (z - a.zAglM) / (b.zAglM - a.zAglM || 1)
      return { u: a.u + f * (b.u - a.u), v: a.v + f * (b.v - a.v) }
    }
  }
  const last = w[w.length - 1]!
  return { u: last.u, v: last.v }
}

const meanWind = (w: Wind[], z0: number, z1: number): { u: number; v: number } => {
  let u = 0
  let v = 0
  const n = 60
  for (let i = 0; i <= n; i++) {
    const x = windAt(w, z0 + ((z1 - z0) * i) / n)
    u += x.u
    v += x.v
  }
  return { u: u / (n + 1), v: v / (n + 1) }
}

export interface Kinematics {
  /** m/s */
  stormMotion: { u: number; v: number }
  /** knots */
  shear06Kt: number
  shear01Kt: number
  /** m2/s2 */
  srh01: number
  srh03: number
}

/** Bulk shear and storm-relative helicity with the Bunkers right-mover; undefined without 6 km of wind. */
export function kinematics(levels: readonly SoundingLevel[]): Kinematics | undefined {
  const w = windProfile(levels)
  if (w.length < 3 || w[w.length - 1]!.zAglM < 6000) return undefined
  const mean = meanWind(w, 0, 6000)
  const lo = meanWind(w, 0, 500)
  const hi = meanWind(w, 5500, 6000)
  const sx = hi.u - lo.u
  const sy = hi.v - lo.v
  const mag = Math.hypot(sx, sy) || 1
  const cx = mean.u + (7.5 * sy) / mag
  const cy = mean.v - (7.5 * sx) / mag
  const srh = (top: number): number => {
    let sum = 0
    for (let z = 0; z < top; z += 50) {
      const a = windAt(w, z)
      const b = windAt(w, z + 50)
      sum += (b.u - cx) * (a.v - cy) - (a.u - cx) * (b.v - cy)
    }
    return Math.round(sum)
  }
  const bulk = (top: number): number => {
    const s = windAt(w, 0)
    const t = windAt(w, top)
    return Math.round((Math.hypot(t.u - s.u, t.v - s.v) / KT_TO_MS) * 10) / 10
  }
  return {
    stormMotion: { u: cx, v: cy },
    shear06Kt: bulk(6000),
    shear01Kt: bulk(1000),
    srh01: srh(1000),
    srh03: srh(3000),
  }
}

/** Direction (degrees the wind blows from) and speed (kt) of a u,v pair in m/s. */
export function dirSpeed(u: number, v: number): { dirDeg: number; speedKt: number } {
  return {
    dirDeg: (Math.round((Math.atan2(-u, -v) * 180) / Math.PI) + 360) % 360,
    speedKt: Math.hypot(u, v) / KT_TO_MS,
  }
}
