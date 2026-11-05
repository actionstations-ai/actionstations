// A polar field: one radar moment on one sweep, as the radar measures it (radials by gates) in
// a compact form a figure carries as data. Codes are 8-bit integers with a scale and offset
// (value = (code - offset) / scale; code 0 is "below threshold", 1 is "range folded"), stored
// deflated and base64-encoded, radial-major. Pure apart from zlib.
import { deflateSync, inflateSync } from 'node:zlib'
import { z } from 'zod'

const MAX_RADIALS = 1440
const MAX_GATES = 2000

export const PolarField = z
  .object({
    /** Beam azimuth of each radial, degrees clockwise from north (any order). */
    azimuthsDeg: z.array(z.number().min(0).max(360)).min(1).max(MAX_RADIALS),
    gates: z.number().int().min(1).max(MAX_GATES),
    /** Range to the middle of the first gate, meters. */
    firstGateM: z.number().min(0).max(100_000),
    gateSpacingM: z.number().min(25).max(5000),
    scale: z.number().positive(),
    offset: z.number(),
    /** Deflated, base64-encoded codes, `radials * gates` bytes before deflate. */
    codes: z.string().max(4_000_000),
  })
  .superRefine((f, ctx) => {
    try {
      const raw = inflateSync(Buffer.from(f.codes, 'base64'))
      if (raw.length !== f.azimuthsDeg.length * f.gates)
        ctx.addIssue({
          code: 'custom',
          path: ['codes'],
          message: `expected ${f.azimuthsDeg.length * f.gates} codes, found ${raw.length}`,
        })
    } catch {
      ctx.addIssue({ code: 'custom', path: ['codes'], message: 'not deflated base64 data' })
    }
  })
export type PolarField = z.infer<typeof PolarField>

/** Build a field from raw codes (radial-major). */
export function packPolar(meta: Omit<PolarField, 'codes'>, codes: Uint8Array): PolarField {
  return { ...meta, codes: Buffer.from(deflateSync(codes, { level: 9 })).toString('base64') }
}

export const unpackCodes = (f: PolarField): Uint8Array =>
  new Uint8Array(inflateSync(Buffer.from(f.codes, 'base64')))

/** Physical value of a code, or undefined for "below threshold" and "range folded". */
export const polarValue = (f: PolarField, code: number): number | undefined =>
  code <= 1 ? undefined : (code - f.offset) / f.scale

export const gateRangeM = (f: PolarField, gate: number): number =>
  f.firstGateM + gate * f.gateSpacingM

/** Radial indexes ordered by azimuth, for nearest-radial lookup. */
export interface RadialIndex {
  order: number[]
  azimuths: number[]
}

export function radialIndex(f: PolarField): RadialIndex {
  const order = f.azimuthsDeg.map((_, i) => i).sort((a, b) => f.azimuthsDeg[a]! - f.azimuthsDeg[b]!)
  return { order, azimuths: order.map((i) => f.azimuthsDeg[i]!) }
}

/** The radial whose beam covers `az`, or -1 when `az` falls in a gap wider than a beam. */
export function radialAt(idx: RadialIndex, az: number, beam: number): number {
  const a = idx.azimuths
  let lo = 0
  let hi = a.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (a[mid]! < az) lo = mid + 1
    else hi = mid
  }
  const cands = [lo, (lo + a.length - 1) % a.length]
  let best = -1
  let bestD = Infinity
  for (const c of cands) {
    const d = Math.abs(((a[c]! - az + 540) % 360) - 180)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return bestD <= beam ? idx.order[best]! : -1
}

/** Typical angular spacing between radials, degrees (the median gap). */
export function beamSpacing(f: PolarField): number {
  const a = [...f.azimuthsDeg].sort((x, y) => x - y)
  const gaps: number[] = []
  for (let i = 1; i < a.length; i++) gaps.push(a[i]! - a[i - 1]!)
  if (!gaps.length) return 1
  gaps.sort((x, y) => x - y)
  return Math.max(0.1, gaps[gaps.length >> 1]!)
}
