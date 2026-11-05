// The simple relations behind the simulated earth science events (spec 0450 FR-11, out of scope:
// physics-based ground motion, ash dispersion or tsunami propagation). Each is a published or
// textbook form with its source named, deterministic, and pure.
//
//   rupture length   Wells and Coppersmith (1994), subsurface rupture length, all slip types:
//                    log10 L(km) = -2.44 + 0.59 M
//   aftershocks      Reasenberg and Jones (1989), generic California: the rate of aftershocks of
//                    magnitude M or larger t days after a mainshock of magnitude Mm is
//                    10^(a + b (Mm - M)) (t + c)^-p with a = -1.67, b = 0.91, p = 1.08, c = 0.05.
//                    The forecast chance of at least one is 1 - exp(-expected number), the form the
//                    USGS aftershock forecasts use.
//   shaking          intensity falls with the distance to the rupture by the form
//                    I = A + B M - C log10(sqrt(R^2 + h^2)) - D R (R rupture distance in km),
//                    with coefficients chosen so that a M 6.8 gives about MMI VIII at 10 km, VII at
//                    30 km, VI at 70 km and V at 150 km. It is a teaching relation, not a ground
//                    motion model, and the exercise products say simulated.
//   travel times     shear waves 3.5 km/s, compressional 6.5 km/s; tsunami waves at the
//                    shallow-water speed sqrt(g d) for a mean depth d.

export const KM_PER_DEG = 111.32
export const VS_KM_S = 3.5
export const VP_KM_S = 6.5
const G = 9.81

// ---- numbers ------------------------------------------------------------------------------

/** A small seeded generator (mulberry32): the same seed gives the same sequence everywhere. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A Poisson draw: Knuth's method for small means, a normal approximation for large ones. */
export function poisson(mean: number, rand: () => number): number {
  if (mean <= 0) return 0
  if (mean > 40) {
    const u1 = Math.max(rand(), 1e-12)
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand())
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * z))
  }
  const limit = Math.exp(-mean)
  let k = 0
  let p = 1
  do {
    k++
    p *= rand()
  } while (p > limit)
  return k - 1
}

// ---- geometry -----------------------------------------------------------------------------

export interface LonLat {
  lon: number
  lat: number
}

/** Great-circle distance in kilometers. */
export function distanceKm(a: LonLat, b: LonLat): number {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLon = (b.lon - a.lon) * r
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Move `km` from a point along a bearing (degrees clockwise from north), small-distance form. */
export function destination(p: LonLat, bearingDeg: number, km: number): LonLat {
  const b = (bearingDeg * Math.PI) / 180
  const lat = p.lat + (km * Math.cos(b)) / KM_PER_DEG
  const lon =
    p.lon + (km * Math.sin(b)) / (KM_PER_DEG * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)))
  return { lon, lat }
}

/** Distance in km from a point to the segment a-b, in a local flat projection. */
export function distanceToSegmentKm(p: LonLat, a: LonLat, b: LonLat): number {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const xy = (q: LonLat): [number, number] => [
    (q.lon - a.lon) * KM_PER_DEG * k,
    (q.lat - a.lat) * KM_PER_DEG,
  ]
  const [px, py] = xy(p)
  const [bx, by] = xy(b)
  const len2 = bx * bx + by * by
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  return Math.hypot(px - t * bx, py - t * by)
}

// ---- rupture and shaking ------------------------------------------------------------------

/** Subsurface rupture length in km, Wells and Coppersmith (1994), all slip types. */
export const ruptureLengthKm = (magnitude: number): number => 10 ** (-2.44 + 0.59 * magnitude)

/** The rupture as a line through the epicenter along the strike, centered on it. */
export function ruptureLine(
  epicenter: LonLat,
  magnitude: number,
  strikeDeg: number,
): [LonLat, LonLat] {
  const half = ruptureLengthKm(magnitude) / 2
  return [destination(epicenter, strikeDeg + 180, half), destination(epicenter, strikeDeg, half)]
}

const SHAKING = { a: 1.5, b: 1.45, c: 3.0, d: 0.0015, h: 8 }

/** Modified Mercalli intensity (1 to 10, one decimal) at a rupture distance in km. */
export function intensityAt(magnitude: number, ruptureDistanceKm: number): number {
  const r = Math.max(0, ruptureDistanceKm)
  const i =
    SHAKING.a +
    SHAKING.b * magnitude -
    SHAKING.c * Math.log10(Math.sqrt(r * r + SHAKING.h * SHAKING.h)) -
    SHAKING.d * r
  return Math.round(Math.min(10, Math.max(1, i)) * 10) / 10
}

// ---- aftershocks --------------------------------------------------------------------------

export interface OmoriParams {
  a: number
  b: number
  p: number
  c: number
}

/** Reasenberg and Jones (1989) generic California parameters (c in days). */
export const GENERIC_AFTERSHOCKS: OmoriParams = { a: -1.67, b: 0.91, p: 1.08, c: 0.05 }

/** Expected number of aftershocks of magnitude `minMag` or larger between t1 and t2 days. */
export function expectedAftershocks(
  mainMag: number,
  minMag: number,
  t1Days: number,
  t2Days: number,
  m: OmoriParams = GENERIC_AFTERSHOCKS,
): number {
  const k = 10 ** (m.a + m.b * (mainMag - minMag))
  const f = (t: number): number =>
    m.p === 1 ? Math.log(t + m.c) : (t + m.c) ** (1 - m.p) / (1 - m.p)
  return k * (f(t2Days) - f(t1Days))
}

/** The chance of at least one such aftershock: 1 - exp(-expected number). */
export const chanceAtLeastOne = (expected: number): number => 1 - Math.exp(-expected)

export interface AftershockEvent {
  /** Days after the mainshock. */
  t: number
  magnitude: number
}

/**
 * One aftershock sequence drawn from the same rate the forecast uses: the count is Poisson with
 * the expected number, times follow the Omori law, magnitudes the Gutenberg-Richter law truncated
 * below the mainshock. The same seed gives the same sequence.
 */
export function sampleAftershocks(
  mainMag: number,
  minMag: number,
  days: number,
  seed: number,
  m: OmoriParams = GENERIC_AFTERSHOCKS,
): AftershockEvent[] {
  const rand = rng(seed)
  const n = poisson(expectedAftershocks(mainMag, minMag, 0, days, m), rand)
  const top = mainMag - 0.1
  const f0 = m.c ** (1 - m.p)
  const f1 = (days + m.c) ** (1 - m.p)
  const out: AftershockEvent[] = []
  for (let i = 0; i < n; i++) {
    // Inverse of the cumulative Omori integral for (t + c)^-p.
    const u = rand()
    const t =
      Math.abs(1 - m.p) < 1e-9
        ? (days + m.c) ** u * m.c ** (1 - u) - m.c
        : (f0 + u * (f1 - f0)) ** (1 / (1 - m.p)) - m.c
    // Truncated Gutenberg-Richter: magnitude above minMag, below the top.
    const span = 1 - 10 ** (-m.b * (top - minMag))
    const mag = minMag - Math.log10(1 - rand() * span) / m.b
    out.push({
      t: Math.round(Math.max(0, t) * 10_000) / 10_000,
      magnitude: Math.round(Math.min(top, mag) * 10) / 10,
    })
  }
  return out.sort((x, y) => x.t - y.t)
}

export const FORECAST_WINDOWS = [
  { label: 'Next 1 Day', startDay: 0, endDay: 1 },
  { label: 'Next 1 Week', startDay: 0, endDay: 7 },
  { label: 'Next 1 Month', startDay: 0, endDay: 30 },
  { label: 'Next 1 Year', startDay: 0, endDay: 365 },
] as const

export const FORECAST_MAGNITUDES = [3, 5, 6, 7] as const

export interface ForecastRow {
  minMagnitude: number
  expected: number
  chance: number
}

/** The forecast table for windows that start `elapsedDays` after the mainshock. */
export function aftershockForecast(
  mainMag: number,
  elapsedDays: number,
  m: OmoriParams = GENERIC_AFTERSHOCKS,
): { label: string; rows: ForecastRow[] }[] {
  return FORECAST_WINDOWS.map((w) => ({
    label: w.label,
    rows: FORECAST_MAGNITUDES.map((mag) => {
      const expected = expectedAftershocks(
        mainMag,
        mag,
        elapsedDays + w.startDay,
        elapsedDays + w.endDay,
        m,
      )
      return { minMagnitude: mag, expected, chance: chanceAtLeastOne(expected) }
    }),
  }))
}

/** "12%", "<1%" or ">99%": how the forecast products print a chance. */
export function percentText(chance: number): string {
  const pct = chance * 100
  if (pct > 99) return '>99%'
  if (pct < 1) return '<1%'
  return `${Math.round(pct)}%`
}

/** "0 to 2": the range holding about 95% of Poisson draws around the expected number. */
export function expectedRangeText(expected: number): string {
  if (expected < 0.05) return '0'
  const spread = 1.96 * Math.sqrt(expected)
  const lo = Math.max(0, Math.floor(expected - spread))
  const hi = Math.ceil(expected + spread)
  return lo === hi ? String(lo) : `${lo} to ${hi}`
}

// ---- early warning ------------------------------------------------------------------------

/** Seconds from rupture start to an alert reaching the public: detection, processing, delivery. */
export const DEFAULT_ALERT_DELAY_S = 8

export interface EewPlace {
  name: string
  distanceKm: number
  alertSec: number
  shakingSec: number
  warningSec: number
}

/** Alert and strong-shaking times at a place: the alert time is the same everywhere, shaking is distance over shear speed. */
export function eewTimes(
  name: string,
  epicentralKm: number,
  depthKm: number,
  alertDelaySec: number = DEFAULT_ALERT_DELAY_S,
): EewPlace {
  const hypo = Math.hypot(epicentralKm, depthKm)
  const shaking = hypo / VS_KM_S
  const r = (v: number): number => Math.round(v * 10) / 10
  return {
    name,
    distanceKm: Math.round(epicentralKm),
    alertSec: r(alertDelaySec),
    shakingSec: r(shaking),
    warningSec: r(shaking - alertDelaySec),
  }
}

// ---- tsunami ------------------------------------------------------------------------------

/** Shallow-water wave speed in km/s for a mean depth in meters. */
export const tsunamiSpeedKmS = (meanDepthM: number): number => Math.sqrt(G * meanDepthM) / 1000

/** Minutes from the source event to the first wave, over the great-circle distance. */
export function tsunamiMinutes(distance: number, meanDepthM: number): number {
  return Math.round(distance / tsunamiSpeedKmS(meanDepthM) / 60)
}
