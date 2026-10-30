import { describe, expect, it } from 'vitest'
import { formatLatLon, schematicPoints } from './schematic'

describe('schematicPoints', () => {
  it('returns nothing for no places', () => {
    expect(schematicPoints([])).toEqual([])
  })

  it('puts a single place in the middle', () => {
    expect(schematicPoints([{ lat: 47.45, lon: -122.3 }])).toEqual([{ x: 50, y: 50 }])
  })

  it('puts north above south and east right of west', () => {
    const [nw, se] = schematicPoints([
      { lat: 47.5, lon: -122.4 },
      { lat: 47.4, lon: -122.2 },
    ])
    expect(nw!.y).toBeLessThan(se!.y)
    expect(nw!.x).toBeLessThan(se!.x)
  })

  it('keeps every point inside the frame, away from the edge', () => {
    const points = schematicPoints([
      { lat: 10, lon: 10 },
      { lat: 10.001, lon: 40 },
      { lat: -5, lon: 25 },
    ])
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(10)
      expect(p.x).toBeLessThanOrEqual(90)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(100)
    }
  })

  it('keeps the order of the input', () => {
    const points = schematicPoints([
      { lat: 1, lon: 1 },
      { lat: 2, lon: 2 },
      { lat: 3, lon: 3 },
    ])
    expect(points.map((p) => p.y)).toEqual([...points.map((p) => p.y)].sort((a, b) => b - a))
  })
})

describe('formatLatLon', () => {
  it('names the hemispheres', () => {
    expect(formatLatLon({ lat: 47.45021, lon: -122.30881 })).toBe('47.4502° N, 122.3088° W')
    expect(formatLatLon({ lat: -33.9, lon: 151.2 })).toBe('33.9000° S, 151.2000° E')
  })
})
