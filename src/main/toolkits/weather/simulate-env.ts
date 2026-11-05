// Simulated environment for a convective event (spec 0449 FR-8): a sounding that fits the
// storm mode, analytic mesoanalysis and model temperature grids, and a station's observations as
// the storm passes. Piecewise-linear profiles, no model; the sounding is checked against the
// same thermodynamics the skew-T figure computes, so its indices agree with its mode.
import { packGrid, type GridField } from '../../render/figures/weather/grid'
import type { MeteogramData } from '../../render/figures/weather/meteogram'
import type { SoundingData } from '../../render/figures/weather/sounding'
import { kinematics, surfaceParcel, type SoundingLevel } from '../../render/figures/weather/thermo'
import type { StormMode } from './simulate-storm'

type Pts = [number, number][]

/** Piecewise-linear value at `z` (km). */
function at(pts: Pts, z: number): number {
  if (z <= pts[0]![0]) return pts[0]![1]
  for (let i = 0; i + 1 < pts.length; i++) {
    const [z0, v0] = pts[i]!
    const [z1, v1] = pts[i + 1]!
    if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0)
  }
  return pts[pts.length - 1]![1]
}

interface Profile {
  temp: Pts
  dew: Pts
  /** [z km, direction, knots] */
  wind: [number, number, number][]
}

const PROFILES: Record<StormMode, Profile> = {
  supercell: {
    temp: [
      [0, 27],
      [1, 20.5],
      [1.5, 17.5],
      [3, 9],
      [5.5, -8],
      [9, -37],
      [12, -58],
      [16, -62],
    ],
    dew: [
      [0, 21],
      [1, 18],
      [1.5, 16],
      [3, 2],
      [5.5, -18],
      [9, -45],
      [12, -65],
      [16, -80],
    ],
    wind: [
      [0, 150, 12],
      [1, 175, 26],
      [3, 215, 38],
      [6, 250, 52],
      [9, 260, 70],
      [12, 265, 80],
      [16, 265, 55],
    ],
  },
  line: {
    temp: [
      [0, 25],
      [1, 19],
      [1.5, 16.5],
      [3, 8],
      [5.5, -9.5],
      [9, -38],
      [12, -58],
      [16, -62],
    ],
    dew: [
      [0, 19],
      [1, 16],
      [1.5, 13],
      [3, 0],
      [5.5, -20],
      [9, -46],
      [12, -66],
      [16, -80],
    ],
    wind: [
      [0, 200, 15],
      [1, 215, 30],
      [3, 235, 42],
      [6, 250, 52],
      [9, 255, 70],
      [12, 260, 80],
      [16, 260, 50],
    ],
  },
  multicell: {
    temp: [
      [0, 30],
      [1, 23],
      [1.5, 20],
      [3, 11],
      [5.5, -6.5],
      [9, -36],
      [12, -57],
      [16, -62],
    ],
    dew: [
      [0, 21],
      [1, 18.5],
      [1.5, 16],
      [3, 5],
      [5.5, -15],
      [9, -44],
      [12, -64],
      [16, -80],
    ],
    wind: [
      [0, 190, 6],
      [1, 200, 10],
      [3, 225, 18],
      [6, 245, 28],
      [9, 250, 40],
      [12, 255, 50],
      [16, 255, 30],
    ],
  },
}

/** The wind at `z` km by interpolating components, so the direction turns the short way. */
function windAt(w: Profile['wind'], z: number): { dir: number; kt: number } {
  const u = at(
    w.map(([zz, d, k]) => [zz, -k * Math.sin((d * Math.PI) / 180)] as [number, number]),
    z,
  )
  const v = at(
    w.map(([zz, d, k]) => [zz, -k * Math.cos((d * Math.PI) / 180)] as [number, number]),
    z,
  )
  return {
    dir: (Math.round((Math.atan2(-u, -v) * 180) / Math.PI) + 360) % 360,
    kt: Math.round(Math.hypot(u, v)),
  }
}

/** Levels every 500 m to 12 km and every 1 km above, with pressure from the hypsometric equation. */
export function simulatedLevels(
  mode: StormMode,
  surfaceHpa = 985,
  surfaceM = 250,
): SoundingLevel[] {
  const pr = PROFILES[mode]
  const zs = [0, ...Array.from({ length: 24 }, (_, i) => 0.5 * (i + 1)), 13, 14, 15, 16]
  const levels: SoundingLevel[] = []
  let p = surfaceHpa
  let prevZ = 0
  let prevT = at(pr.temp, 0) + 273.15
  for (const z of zs) {
    const t = at(pr.temp, z)
    if (z > 0)
      p *= Math.exp((-9.80665 * (z - prevZ) * 1000) / (287.04 * ((prevT + t + 273.15) / 2)))
    prevZ = z
    prevT = t + 273.15
    const w = windAt(pr.wind, z)
    levels.push({
      pressureHpa: Math.round(p * 10) / 10,
      heightM: Math.round(surfaceM + z * 1000),
      tempC: Math.round(t * 10) / 10,
      dewpointC: Math.round(at(pr.dew, z) * 10) / 10,
      windDirDeg: w.dir,
      windSpeedKt: w.kt,
    })
  }
  return levels
}

export function simulatedSounding(
  mode: StormMode,
  timeIso: string,
  station: { id: string; name?: string },
): SoundingData {
  return {
    origin: 'simulated',
    station: { id: station.id, ...(station.name ? { name: station.name } : {}) },
    time: timeIso,
    levels: simulatedLevels(mode) as SoundingData['levels'],
  }
}

/** The indices a sounding of this mode produces, for tests and for the generator's own checks. */
export function soundingIndices(mode: StormMode): {
  cape: number
  shear06Kt: number
  srh03: number
} {
  const lv = simulatedLevels(mode)
  return {
    cape: surfaceParcel(lv)?.cape ?? 0,
    shear06Kt: kinematics(lv)?.shear06Kt ?? 0,
    srh03: kinematics(lv)?.srh03 ?? 0,
  }
}

// ---- grids ----------------------------------------------------------------------------------

export interface GridArea {
  west: number
  south: number
  east: number
  north: number
  nx: number
  ny: number
}

/** A grid of `f(lat, lon)` over the area, rows from the north. */
export function gridOf(area: GridArea, f: (lat: number, lon: number) => number): GridField {
  const values: number[] = []
  for (let r = 0; r < area.ny; r++)
    for (let c = 0; c < area.nx; c++) {
      const lat = area.north - ((r + 0.5) / area.ny) * (area.north - area.south)
      const lon = area.west + ((c + 0.5) / area.nx) * (area.east - area.west)
      values.push(Math.round(f(lat, lon) * 10) / 10)
    }
  return packGrid(area, values)
}

/** Observations at a station the storm crosses: a drop in temperature, a wind and pressure surge, rain. */
export function simulatedObservations(opts: {
  station: { id: string; name?: string }
  startIso: string
  stepMin: number
  steps: number
  /** Minute of the storm's passage over the station. */
  passageMin: number
  peakGustKt: number
  seed: number
}): MeteogramData {
  const times: string[] = []
  const temp: number[] = []
  const dew: number[] = []
  const wind: number[] = []
  const gust: (number | null)[] = []
  const dir: number[] = []
  const pres: number[] = []
  const rain: number[] = []
  const t0 = Date.parse(opts.startIso)
  for (let k = 0; k < opts.steps; k++) {
    const m = k * opts.stepMin
    const d = m - opts.passageMin
    const pass = Math.exp(-(d * d) / (2 * 8 * 8))
    const after = 1 / (1 + Math.exp(-d / 6))
    times.push(new Date(t0 + m * 60_000).toISOString().replace('.000Z', '+00:00'))
    temp.push(Math.round(84 - 14 * after + (k % 3)))
    dew.push(Math.round(70 + 1 * after - (k % 2)))
    wind.push(Math.round(8 + 0.55 * (opts.peakGustKt - 8) * pass))
    gust.push(pass > 0.2 ? Math.round(10 + (opts.peakGustKt - 10) * pass) : null)
    dir.push(Math.round(190 + 80 * after) % 360)
    pres.push(
      Math.round(
        (1008.5 - 3.2 * Math.exp(-((d + 12) ** 2) / 200) + 2.4 * pass + 1.2 * after) * 10,
      ) / 10,
    )
    rain.push(Math.round(0.55 * pass * 100) / 100)
  }
  return {
    origin: 'simulated',
    station: opts.station,
    times,
    tempF: temp,
    dewpointF: dew,
    windKt: wind,
    gustKt: gust,
    windDirDeg: dir,
    pressureMb: pres,
    precipIn: rain,
  }
}
