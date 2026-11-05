// Simulated spills and plumes for a fictional release (spec 0455 FR-7, #771): a consistent
// trajectory, weathering curve and toxic plume from simple published relations, with an
// uncertainty envelope, and the landfall time of each shoreline segment. This is not an oil spill
// model: it exists so an exercise has numbers that agree with each other. Real model output is
// imported instead (trajectory import). Everything it returns is labeled simulated by the caller.
//
// Relations used (all textbook):
//  - drift: the current plus a fraction of the wind (default 3 percent), the usual rule of thumb;
//  - spreading: the slick area is the volume left divided by a thickness that thins with time;
//  - weathering: first-order approach of the evaporated and dispersed fractions to a limit that
//    depends on the product, per parcel of oil by age;
//  - plume: the Gaussian plume for a continuous ground-level release with the Briggs
//    open-country dispersion coefficients (Briggs 1973) for stability classes A to F.
// Pure functions, no I/O, deterministic.

const EARTH_M = 6_371_000
const RAD = Math.PI / 180

export interface LatLon {
  lat: number
  lon: number
}

export interface Vec {
  /** Eastward component in meters per second. */
  east: number
  /** Northward component in meters per second. */
  north: number
}

/** Wind and current given as a direction and speed: the wind blows FROM `fromDeg`, the current flows TOWARD. */
export function windVector(fromDeg: number, speedMs: number): Vec {
  const toward = (fromDeg + 180) * RAD
  return { east: speedMs * Math.sin(toward), north: speedMs * Math.cos(toward) }
}
export function currentVector(towardDeg: number, speedMs: number): Vec {
  const t = towardDeg * RAD
  return { east: speedMs * Math.sin(t), north: speedMs * Math.cos(t) }
}

/** Meters between two points (equirectangular approximation, fine over tens of kilometers). */
export function distanceM(a: LatLon, b: LatLon): number {
  const x = (b.lon - a.lon) * RAD * Math.cos(((a.lat + b.lat) / 2) * RAD)
  const y = (b.lat - a.lat) * RAD
  return Math.hypot(x, y) * EARTH_M
}

function moveBy(p: LatLon, eastM: number, northM: number): LatLon {
  return {
    lat: p.lat + northM / EARTH_M / RAD,
    lon: p.lon + eastM / (EARTH_M * Math.cos(p.lat * RAD)) / RAD,
  }
}

/** Distance from a point to a polyline of points, in meters (local flat projection). */
export function distanceToLineM(p: LatLon, line: readonly LatLon[]): number {
  const k = Math.cos(p.lat * RAD)
  const local = (q: LatLon) => ({
    x: (q.lon - p.lon) * RAD * k * EARTH_M,
    y: (q.lat - p.lat) * RAD * EARTH_M,
  })
  let best = Infinity
  for (let i = 0; i < line.length; i++) {
    const a = local(line[i]!)
    const b = line[i + 1] ? local(line[i + 1]!) : a
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2))
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy))
  }
  return best
}

// ---- products and weathering ------------------------------------------------------------------

export interface ProductWeathering {
  label: string
  /** Share of the oil that can evaporate, and the time constant in hours. */
  evaporation: { limit: number; tauHours: number }
  /** Share that disperses naturally in moderate seas, and its time constant. */
  dispersion: { limit: number; tauHours: number }
  /** Density in kilograms per cubic meter (for mass reporting). */
  densityKgM3: number
}

export const PRODUCTS = {
  diesel: {
    label: 'Diesel',
    evaporation: { limit: 0.45, tauHours: 10 },
    dispersion: { limit: 0.25, tauHours: 20 },
    densityKgM3: 840,
  },
  light_crude: {
    label: 'Light crude oil',
    evaporation: { limit: 0.4, tauHours: 18 },
    dispersion: { limit: 0.15, tauHours: 36 },
    densityKgM3: 840,
  },
  medium_crude: {
    label: 'Medium crude oil',
    evaporation: { limit: 0.28, tauHours: 30 },
    dispersion: { limit: 0.1, tauHours: 48 },
    densityKgM3: 880,
  },
  heavy_fuel: {
    label: 'Heavy fuel oil',
    evaporation: { limit: 0.08, tauHours: 48 },
    dispersion: { limit: 0.03, tauHours: 72 },
    densityKgM3: 980,
  },
} as const satisfies Record<string, ProductWeathering>
export type ProductId = keyof typeof PRODUCTS

export const BARREL_M3 = 0.158987294928
export const GALLON_M3 = 0.003785411784

export type VolumeUnit = 'bbl' | 'gal' | 'm3'
const UNIT_M3: Record<VolumeUnit, number> = { bbl: BARREL_M3, gal: GALLON_M3, m3: 1 }
export const toM3 = (v: number, unit: VolumeUnit): number => v * UNIT_M3[unit]
export const fromM3 = (v: number, unit: VolumeUnit): number => v / UNIT_M3[unit]

// ---- the trajectory and the mass balance ---------------------------------------------------------

export interface Shoreline {
  id: string
  name: string
  /** ESI shoreline class label ("10A salt marsh"), for the figures. */
  esi?: string
  points: LatLon[]
}

export interface SpillInput {
  origin: LatLon
  product: ProductId
  volume: number
  unit: VolumeUnit
  /** Hours the release lasts (a tank failure may be minutes; a leak days). */
  releaseHours: number
  /** Hours to simulate and the step in hours. */
  hours: number
  stepHours?: number
  /** Wind (from) and current (toward), constant or by hour from the start. */
  wind: Vec | ((hour: number) => Vec)
  current: Vec | ((hour: number) => Vec)
  /** Fraction of the wind speed added to the drift (default 0.03). */
  windFactor?: number
  /** Oil recovered per hour, in the input unit, once response starts. */
  recovery?: { startHour: number; perHour: number }
  shorelines?: readonly Shoreline[]
  /** Scale on natural dispersion: 0.5 in calm seas, 1 in moderate seas, 2 in rough seas. */
  seaStateFactor?: number
}

export interface SpillStep {
  hour: number
  center: LatLon
  /** Slick radius in meters (equivalent circle of the oil on the water). */
  radiusM: number
  /** Position uncertainty (radius of the envelope) in meters. */
  uncertaintyM: number
  /** Meters traveled from the origin. */
  traveledM: number
  /** Volumes in the input unit; they sum to `released`. */
  released: number
  evaporated: number
  dispersed: number
  recovered: number
  remaining: number
  /** Oil on the shore: remaining oil that has reached a shoreline (zero until landfall). */
  ashore: number
}

export interface Landfall {
  shorelineId: string
  /** First hour the slick envelope (radius plus the uncertainty on the way) touches the segment. */
  hour: number
  /** First hour the best-estimate slick edge touches it (without the uncertainty). */
  bestEstimateHour: number
}

export interface SpillResult {
  steps: SpillStep[]
  landfalls: Landfall[]
  product: ProductWeathering
  unit: VolumeUnit
  releasedTotal: number
}

interface Parcel {
  volume: number
  bornHour: number
  evaporated: number
  dispersed: number
  left: number
}

const at = (v: Vec | ((h: number) => Vec), hour: number): Vec =>
  typeof v === 'function' ? v(hour) : v
const sumOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/** Thickness of the oil on the water in meters: 10 mm at first, thinning toward 0.1 mm. */
export const slickThicknessM = (ageHours: number): number =>
  Math.max(0.0001, 0.01 * Math.exp(-ageHours / 12))

export function simulateSpill(input: SpillInput): SpillResult {
  const dt = input.stepHours ?? 1
  const product = PRODUCTS[input.product]
  const total = input.volume
  const windFactor = input.windFactor ?? 0.03
  const seaState = input.seaStateFactor ?? 1
  const parcels: Parcel[] = []
  const steps: SpillStep[] = []
  let center = input.origin
  let traveled = 0
  let recovered = 0
  let releasedSoFar = 0
  const landfalls = new Map<string, Landfall>()

  for (let hour = 0; hour <= input.hours + 1e-9; hour += dt) {
    // New oil released in this step (all of it at hour 0 for an instant release).
    const releasedNow =
      input.releaseHours <= 0
        ? hour === 0
          ? total
          : 0
        : Math.min(total, (total * Math.min(hour, input.releaseHours)) / input.releaseHours)
    const added = releasedNow - releasedSoFar
    if (added > 0) {
      parcels.push({ volume: added, bornHour: hour, evaporated: 0, dispersed: 0, left: added })
      releasedSoFar = releasedNow
    }
    for (const p of parcels) weatherParcel(p, hour, product, seaState)
    recovered += recoverStep(parcels, input, hour, dt)

    const w = at(input.wind, hour)
    const c = at(input.current, hour)
    const drift = { east: c.east + windFactor * w.east, north: c.north + windFactor * w.north }
    if (hour > 0) {
      const moveE = drift.east * dt * 3600
      const moveN = drift.north * dt * 3600
      center = moveBy(center, moveE, moveN)
      traveled += Math.hypot(moveE, moveN)
    }
    const evaporated = sumOf(parcels.map((p) => p.evaporated))
    const dispersed = sumOf(parcels.map((p) => p.dispersed))
    const remaining = sumOf(parcels.map((p) => p.left))
    const meanAge = remaining
      ? sumOf(parcels.map((p) => p.left * (hour - p.bornHour))) / remaining
      : 0
    const areaM2 = toM3(remaining, input.unit) / slickThicknessM(meanAge)
    const radiusM = Math.sqrt(areaM2 / Math.PI)
    const uncertaintyM = radiusM + 0.15 * traveled + 200
    const step: SpillStep = {
      hour,
      center,
      radiusM,
      uncertaintyM,
      traveledM: traveled,
      released: releasedSoFar,
      evaporated,
      dispersed,
      recovered,
      remaining,
      ashore: 0,
    }
    noteLandfalls(step, input.shorelines ?? [], landfalls)
    step.ashore = landfalls.size ? remaining : 0
    steps.push(step)
  }
  return {
    steps,
    landfalls: [...landfalls.values()].sort((a, b) => a.hour - b.hour),
    product,
    unit: input.unit,
    releasedTotal: releasedSoFar,
  }
}

/** Move a parcel's evaporated and dispersed volumes toward their limits for its age. */
function weatherParcel(p: Parcel, hour: number, prod: ProductWeathering, seaState: number): void {
  const age = hour - p.bornHour
  const evapTarget =
    p.volume * prod.evaporation.limit * (1 - Math.exp(-age / prod.evaporation.tauHours))
  const dispTarget = Math.min(
    p.volume * (1 - prod.evaporation.limit),
    p.volume * prod.dispersion.limit * seaState * (1 - Math.exp(-age / prod.dispersion.tauHours)),
  )
  const dEvap = Math.max(0, Math.min(p.left, evapTarget - p.evaporated))
  p.evaporated += dEvap
  p.left -= dEvap
  const dDisp = Math.max(0, Math.min(p.left, dispTarget - p.dispersed))
  p.dispersed += dDisp
  p.left -= dDisp
}

/** Remove recovered oil from the parcels in proportion to what is left; returns the volume taken. */
function recoverStep(parcels: Parcel[], input: SpillInput, hour: number, dt: number): number {
  const r = input.recovery
  if (!r || hour < r.startHour) return 0
  const left = sumOf(parcels.map((p) => p.left))
  const take = Math.min(r.perHour * dt, left * 0.5)
  if (take <= 0 || left <= 0) return 0
  for (const p of parcels) p.left -= (p.left / left) * take
  return take
}

function noteLandfalls(
  step: SpillStep,
  shorelines: readonly Shoreline[],
  seen: Map<string, Landfall>,
) {
  for (const s of shorelines) {
    if (step.remaining <= 0) continue
    const d = distanceToLineM(step.center, s.points)
    const prev = seen.get(s.id)
    const bestHit = d <= step.radiusM
    const envelopeHit = d <= step.uncertaintyM
    if (!prev && (bestHit || envelopeHit))
      seen.set(s.id, {
        shorelineId: s.id,
        hour: step.hour,
        bestEstimateHour: bestHit ? step.hour : Number.POSITIVE_INFINITY,
      })
    else if (prev && bestHit && !Number.isFinite(prev.bestEstimateHour))
      prev.bestEstimateHour = step.hour
  }
}

// ---- the plume -----------------------------------------------------------------------------------

export const STABILITY_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export type StabilityClass = (typeof STABILITY_CLASSES)[number]

/** Briggs (1973) open-country dispersion coefficients in meters at downwind distance x meters. */
export function dispersion(x: number, cls: StabilityClass): { sy: number; sz: number } {
  const sqrtTerm = (1 + 0.0001 * x) ** -0.5
  switch (cls) {
    case 'A':
      return { sy: 0.22 * x * sqrtTerm, sz: 0.2 * x }
    case 'B':
      return { sy: 0.16 * x * sqrtTerm, sz: 0.12 * x }
    case 'C':
      return { sy: 0.11 * x * sqrtTerm, sz: 0.08 * x * (1 + 0.0002 * x) ** -0.5 }
    case 'D':
      return { sy: 0.08 * x * sqrtTerm, sz: 0.06 * x * (1 + 0.0015 * x) ** -0.5 }
    case 'E':
      return { sy: 0.06 * x * sqrtTerm, sz: 0.03 * x * (1 + 0.0003 * x) ** -1 }
    case 'F':
      return { sy: 0.04 * x * sqrtTerm, sz: 0.016 * x * (1 + 0.0003 * x) ** -1 }
  }
}

/** Ground-level concentration in g/m3 at (x downwind, y crosswind) meters from a ground-level continuous release of q g/s. */
export function plumeConcentration(
  q: number,
  windMs: number,
  cls: StabilityClass,
  x: number,
  y = 0,
): number {
  if (x <= 0) return 0
  const { sy, sz } = dispersion(x, cls)
  return (q / (Math.PI * windMs * sy * sz)) * Math.exp(-(y * y) / (2 * sy * sy))
}

/** g/m3 to ppm by volume at 25 C and 1 atm for a gas of molecular weight `mw` (g/mol). */
export const gramsPerM3ToPpm = (c: number, mw: number): number => (c * 1000 * 24.45) / mw

export interface PlumeLevel {
  /** "Red", "Orange", "Yellow" or any label. */
  label: string
  ppm: number
}

export interface PlumeInput {
  /** Release rate in grams per second. */
  releaseGramsPerSecond: number
  windMs: number
  /** Direction the wind blows FROM, degrees. */
  windFromDeg: number
  stability: StabilityClass
  molecularWeight: number
  /** Levels from the highest concentration to the lowest. */
  levels: readonly PlumeLevel[]
  /** Farthest distance to look, meters. */
  maxDistanceM?: number
}

export interface PlumeZone {
  label: string
  ppm: number
  /** Farthest downwind distance where the centerline reaches the level, meters; 0 when it never does. */
  distanceM: number
  /** Widest total width of the zone, meters. */
  widthM: number
  /** Outline in meters east and north of the source. */
  outline: { east: number; north: number }[]
}

/** The zone where the concentration is at least each level: an elongated shape pointing downwind. */
export function plumeFootprint(input: PlumeInput): PlumeZone[] {
  const max = input.maxDistanceM ?? 20_000
  const toward = (input.windFromDeg + 180) * RAD
  const dir = { east: Math.sin(toward), north: Math.cos(toward) }
  const side = { east: dir.north, north: -dir.east }
  const xs: number[] = []
  for (let x = 25; x <= max; x += x < 1000 ? 25 : 100) xs.push(x)
  return input.levels.map((lv) => {
    const levelGm3 = (lv.ppm * input.molecularWeight) / 24.45 / 1000
    const half: { x: number; y: number }[] = []
    for (const x of xs) {
      const c0 = plumeConcentration(input.releaseGramsPerSecond, input.windMs, input.stability, x)
      if (c0 < levelGm3) continue
      const { sy } = dispersion(x, input.stability)
      half.push({ x, y: sy * Math.sqrt(2 * Math.log(c0 / levelGm3)) })
    }
    if (!half.length) return { label: lv.label, ppm: lv.ppm, distanceM: 0, widthM: 0, outline: [] }
    const farthest = half[half.length - 1]!.x
    const near = half[0]!.x
    const upper = half.map((h) => ({ x: h.x, y: h.y }))
    const lower = [...half].reverse().map((h) => ({ x: h.x, y: -h.y }))
    const poly = [{ x: near, y: 0 }, ...upper, { x: farthest, y: 0 }, ...lower]
    return {
      label: lv.label,
      ppm: lv.ppm,
      distanceM: farthest,
      widthM: 2 * Math.max(...half.map((h) => h.y)),
      outline: poly.map((p) => ({
        east: p.x * dir.east + p.y * side.east,
        north: p.x * dir.north + p.y * side.north,
      })),
    }
  })
}
