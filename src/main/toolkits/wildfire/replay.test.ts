// Replay of a real fire (spec 0461 FR-9): frames between mapped perimeters are interpolated,
// labeled so, and sit between their neighbors in time and size.
import { describe, expect, it } from 'vitest'
import { hasInterpolation, replayFrames } from './replay'

const square = (cx: number, cy: number, r: number): [number, number][] => [
  [cx - r, cy - r],
  [cx + r, cy - r],
  [cx + r, cy + r],
  [cx - r, cy + r],
]
const a = { time: '2018-11-08T12:00:00Z', acres: 1000, ring: square(-121.6, 39.8, 0.02) }
const b = { time: '2018-11-08T18:00:00Z', acres: 5000, ring: square(-121.55, 39.78, 0.06) }

describe('replayFrames', () => {
  it('keeps the mapped perimeters as mapped and adds labeled frames between them', () => {
    const frames = replayFrames([b, a], 60)
    expect(frames[0]).toMatchObject({ basis: 'mapped', time: a.time })
    expect(frames[frames.length - 1]).toMatchObject({ basis: 'mapped', time: b.time })
    expect(frames.filter((f) => f.basis === 'mapped')).toHaveLength(2)
    expect(frames.filter((f) => f.basis === 'interpolated')).toHaveLength(5)
    expect(hasInterpolation(frames)).toBe(true)
  })
  it('interpolates time and acres between the neighbors and grows the outline', () => {
    const frames = replayFrames([a, b], 180)
    const mid = frames.find((f) => f.basis === 'interpolated')!
    expect(Date.parse(mid.time)).toBe(Date.parse(a.time) + 180 * 60_000)
    expect(mid.acres).toBe(3000)
    const span = (r: [number, number][]) =>
      Math.max(...r.map((p) => p[0])) - Math.min(...r.map((p) => p[0]))
    expect(span(mid.ring)).toBeGreaterThan(span(a.ring))
    expect(span(mid.ring)).toBeLessThan(span(b.ring))
  })
  it('does not interpolate a single perimeter and caps the number of frames', () => {
    expect(hasInterpolation(replayFrames([a]))).toBe(false)
    expect(
      replayFrames([a, { ...b, time: '2018-11-20T00:00:00Z' }], 15, 20).length,
    ).toBeLessThanOrEqual(21)
  })
})
