// From a decoded sweep to the compact polar field a figure carries (ADR-0095): one moment,
// cropped to the range the exercise needs, still in the radar's own 8-bit codes.
import { packPolar, type PolarField } from '../../../render/figures/weather/polar'
import type { MomentName, Sweep } from './level2'

export interface CropOptions {
  /** Keep gates out to this range, kilometers. */
  maxRangeKm: number
  /** Keep only radials between these azimuths (clockwise from `fromDeg`); default all. */
  sector?: { fromDeg: number; toDeg: number }
}

const inSector = (az: number, s: NonNullable<CropOptions['sector']>): boolean => {
  const span = (s.toDeg - s.fromDeg + 360) % 360
  return (az - s.fromDeg + 360) % 360 <= span
}

/** The sweep's moment as a PolarField, or undefined when the sweep has no such 8-bit moment. */
export function polarFromSweep(
  sweep: Sweep,
  name: MomentName,
  crop: CropOptions,
): PolarField | undefined {
  const m = sweep.moments[name]
  if (!m || m.codes instanceof Uint16Array) return undefined
  const gates = Math.min(
    m.gates,
    Math.max(1, Math.floor((crop.maxRangeKm * 1000 - m.firstGateM) / m.gateSpacingM) + 1),
  )
  const keep = Array.from(sweep.azimuthsDeg)
    .map((az, i) => ({ az, i }))
    .filter(({ az }) => !crop.sector || inSector(az, crop.sector))
  const codes = new Uint8Array(keep.length * gates)
  keep.forEach(({ i }, row) =>
    codes.set(m.codes.subarray(i * m.gates, i * m.gates + gates), row * gates),
  )
  return packPolar(
    {
      azimuthsDeg: keep.map(({ az }) => Math.round(az * 10) / 10),
      gates,
      firstGateM: m.firstGateM,
      gateSpacingM: m.gateSpacingM,
      scale: m.scale,
      offset: m.offset,
    },
    codes,
  )
}
