// Replay of a real fire (spec 0461 FR-9): the mapped perimeters are polygons at times, so the
// frames between two of them are drawn by the app by blending the two outlines (radius by
// bearing around each outline's center). Those frames are labeled interpolated wherever they
// appear and never claim minute-by-minute truth. The mapped perimeters themselves stay
// historical and dated.
type Pt = [number, number]

export interface Perimeter {
  time: string
  acres?: number
  ring: Pt[]
}

export interface ReplayFrame extends Perimeter {
  /** 'mapped' frames are the historical perimeters; 'interpolated' ones are drawn by the app. */
  basis: 'mapped' | 'interpolated'
}

const BEARINGS = 72

function centroid(ring: readonly Pt[]): Pt {
  const lon = ring.reduce((a, p) => a + p[0], 0) / ring.length
  const lat = ring.reduce((a, p) => a + p[1], 0) / ring.length
  return [lon, lat]
}

/** Distance from the center to the outline along each of BEARINGS directions (degrees, scaled for latitude). */
function radii(ring: readonly Pt[], c: Pt): number[] {
  const k = Math.cos((c[1] * Math.PI) / 180)
  const out = new Array<number>(BEARINGS).fill(0)
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    for (let s = 0; s <= 4; s++) {
      const x = (a[0] + ((b[0] - a[0]) * s) / 4 - c[0]) * k
      const y = a[1] + ((b[1] - a[1]) * s) / 4 - c[1]
      const bearing = (Math.atan2(x, y) * 180) / Math.PI
      const idx = Math.round(((bearing + 360) % 360) / (360 / BEARINGS)) % BEARINGS
      out[idx] = Math.max(out[idx]!, Math.hypot(x, y))
    }
  }
  // Fill bearings no vertex fell on from their neighbors so the outline has no spikes inward.
  for (let pass = 0; pass < BEARINGS; pass++)
    for (let i = 0; i < BEARINGS; i++)
      if (out[i] === 0)
        out[i] = Math.max(out[(i + BEARINGS - 1) % BEARINGS]!, out[(i + 1) % BEARINGS]!)
  return out
}

function blend(a: Perimeter, b: Perimeter, f: number): Pt[] {
  const ca = centroid(a.ring)
  const cb = centroid(b.ring)
  const ra = radii(a.ring, ca)
  const rb = radii(b.ring, cb)
  const c: Pt = [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f]
  const k = Math.cos((c[1] * Math.PI) / 180)
  return ra.map((r, i) => {
    const radius = r + (rb[i]! - r) * f
    const t = (i * (360 / BEARINGS) * Math.PI) / 180
    return [
      Math.round((c[0] + (radius * Math.sin(t)) / k) * 1e6) / 1e6,
      Math.round((c[1] + radius * Math.cos(t)) * 1e6) / 1e6,
    ] as Pt
  })
}

/**
 * The mapped perimeters in time order with interpolated frames between them at most `stepMinutes`
 * apart (about `maxFrames` in all). Frames are labeled by basis.
 */
export function replayFrames(
  perimeters: readonly Perimeter[],
  stepMinutes = 60,
  maxFrames = 48,
): ReplayFrame[] {
  const sorted = [...perimeters].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  if (sorted.length < 2) return sorted.map((p) => ({ ...p, basis: 'mapped' as const }))
  const spanMin =
    (Date.parse(sorted[sorted.length - 1]!.time) - Date.parse(sorted[0]!.time)) / 60_000
  const step = Math.max(stepMinutes, Math.ceil(spanMin / Math.max(1, maxFrames - sorted.length)))
  const out: ReplayFrame[] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!
    out.push({ ...a, basis: 'mapped' })
    const b = sorted[i + 1]
    if (!b) break
    const gap = (Date.parse(b.time) - Date.parse(a.time)) / 60_000
    for (let m = step; m < gap; m += step) {
      const f = m / gap
      const acres =
        a.acres !== undefined && b.acres !== undefined
          ? Math.round(a.acres + (b.acres - a.acres) * f)
          : undefined
      out.push({
        time: new Date(Date.parse(a.time) + m * 60_000).toISOString().replace('.000Z', 'Z'),
        ...(acres !== undefined ? { acres } : {}),
        ring: blend(a, b, f),
        basis: 'interpolated',
      })
    }
  }
  return out
}

export const hasInterpolation = (frames: readonly ReplayFrame[]): boolean =>
  frames.some((f) => f.basis === 'interpolated')
