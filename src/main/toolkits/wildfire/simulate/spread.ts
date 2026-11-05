// Simple fire spread for an exercise illustration (spec 0461 FR-10). The shape is an ellipse
// whose length-to-breadth ratio follows Anderson (1983): LB = 0.936 e^(0.2566 U) + 0.461
// e^(-0.1548 U) - 0.397, with U the midflame wind speed in mph. The head, back and flank rates
// follow from the ratio by the standard ellipse relations. The base rate of spread by fuel and
// the wind and slope multipliers are parametric choices, not calibrated fire behavior. Nothing
// here is a prediction: the output labels itself an illustration and the framework labels the
// data simulated.

export interface LonLat {
  lon: number
  lat: number
}

export type FuelClass = 'grass' | 'shrub' | 'timber'

/** Head rate of spread with no wind and no slope, meters per minute. */
export const BASE_RATE_M_PER_MIN: Record<FuelClass, number> = { grass: 8, shrub: 5, timber: 2 }

/** Midflame wind as a share of the wind the schedule gives (a simple sheltering factor). */
const MIDFLAME_FACTOR = 0.4

export interface WindStep {
  /** Hours after the start from which this wind holds. */
  hour: number
  speedMph: number
  /** Direction the wind blows from, degrees clockwise from north. */
  fromDeg: number
}

export interface Slope {
  percent: number
  /** Direction uphill, degrees clockwise from north. */
  upslopeDeg: number
}

const rad = (d: number): number => (d * Math.PI) / 180
const M_PER_DEG_LAT = 111_195

/** Anderson's length-to-breadth ratio for a midflame wind in mph. */
export const lengthToBreadth = (midflameMph: number): number =>
  0.936 * Math.exp(0.2566 * midflameMph) + 0.461 * Math.exp(-0.1548 * midflameMph) - 0.397

/** Wind in effect at an hour: the last schedule step that has started. */
export function windAt(schedule: readonly WindStep[], hour: number): WindStep {
  const sorted = [...schedule].sort((a, b) => a.hour - b.hour)
  let cur = sorted[0]!
  for (const s of sorted) if (s.hour <= hour) cur = s
  return cur
}

export interface EllipseState {
  /** Semi-major and semi-minor axes in meters. */
  a: number
  b: number
  /** Center offset from the ignition in meters, east and north. */
  cx: number
  cy: number
  /** Direction of the head, degrees clockwise from north (downwind). */
  headDeg: number
}

export const initialState = (): EllipseState => ({ a: 15, b: 15, cx: 0, cy: 0, headDeg: 0 })

export interface SpreadInput {
  fuel: FuelClass
  wind: WindStep
  slope?: Slope | undefined
  /** Multiplier from suppression, 0 to 1 (1 = none). */
  suppressionFactor: number
}

/** The head rate of spread, meters per minute, for the wind, slope and suppression. */
export function headRate(i: SpreadInput): { rate: number; headDeg: number; lb: number } {
  const u = i.wind.speedMph * MIDFLAME_FACTOR
  const downwind = (i.wind.fromDeg + 180) % 360
  let rate = BASE_RATE_M_PER_MIN[i.fuel] * (1 + 0.25 * u)
  let headDeg = downwind
  if (i.slope && i.slope.percent > 0) {
    const align = Math.cos(rad(i.slope.upslopeDeg - downwind))
    rate *= 1 + 0.02 * i.slope.percent * Math.max(0, align)
    // A strong slope pulls the head toward uphill when the wind is light.
    if (u < 4 && align < 0) headDeg = i.slope.upslopeDeg
  }
  return { rate: rate * i.suppressionFactor, headDeg, lb: lengthToBreadth(u) }
}

/** Advance the ellipse by `minutes` at the current wind. */
export function step(state: EllipseState, i: SpreadInput, minutes: number): EllipseState {
  const { rate, headDeg, lb } = headRate(i)
  const root = Math.sqrt(Math.max(0, lb * lb - 1))
  const back = (rate * (lb - root)) / (lb + root)
  const aRate = (rate + back) / 2
  const bRate = aRate / lb
  const shift = (rate - back) / 2
  return {
    a: state.a + aRate * minutes,
    b: state.b + bRate * minutes,
    cx: state.cx + shift * minutes * Math.sin(rad(headDeg)),
    cy: state.cy + shift * minutes * Math.cos(rad(headDeg)),
    headDeg,
  }
}

/** Meters east and north of `origin` for a point. */
export function offsetM(origin: LonLat, p: LonLat): { x: number; y: number } {
  const k = Math.cos(rad(origin.lat))
  return { x: (p.lon - origin.lon) * M_PER_DEG_LAT * k, y: (p.lat - origin.lat) * M_PER_DEG_LAT }
}

export function lonLatOf(origin: LonLat, x: number, y: number): LonLat {
  const k = Math.cos(rad(origin.lat))
  return { lon: origin.lon + x / (M_PER_DEG_LAT * k), lat: origin.lat + y / M_PER_DEG_LAT }
}

/**
 * Ellipse value for a point: at most 1 means inside the ellipse grown by `bufferM` on every side.
 * Used for the arrival of the fire at a zone, which has a radius.
 */
export function ellipseQ(state: EllipseState, origin: LonLat, p: LonLat, bufferM = 0): number {
  const o = offsetM(origin, p)
  const dx = o.x - state.cx
  const dy = o.y - state.cy
  const h = rad(state.headDeg)
  // Along the head direction and across it.
  const along = dx * Math.sin(h) + dy * Math.cos(h)
  const across = dx * Math.cos(h) - dy * Math.sin(h)
  const a = state.a + bufferM
  const b = state.b + bufferM
  return (along / a) ** 2 + (across / b) ** 2
}

/** The ellipse outline as a closed ring of 36 points, first point not repeated. */
export function ellipseRing(state: EllipseState, origin: LonLat): LonLat[] {
  const h = rad(state.headDeg)
  const ring: LonLat[] = []
  for (let k = 0; k < 36; k++) {
    const t = (2 * Math.PI * k) / 36
    const along = state.a * Math.cos(t)
    const across = state.b * Math.sin(t)
    const x = state.cx + along * Math.sin(h) + across * Math.cos(h)
    const y = state.cy + along * Math.cos(h) - across * Math.sin(h)
    ring.push(lonLatOf(origin, x, y))
  }
  return ring
}

/** Area in acres. */
export const areaAcres = (s: EllipseState): number => (Math.PI * s.a * s.b) / 4046.856

/** Center of the burned area. */
export const centerOf = (s: EllipseState, origin: LonLat): LonLat => lonLatOf(origin, s.cx, s.cy)
