// EMS and hazmat figure kinds (spec 0456 FR-4, FR-6): numbers in the summary and table, words with
// every color, zone geometry that follows the wind, and the labeled source of the distances.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFigureKinds, renderFigure } from './index'
import {
  circleRing,
  downwindBearing,
  insideIsolation,
  insideProtective,
  offsetAt,
  protectiveSquare,
  zoneGeoJson,
} from './hazmat'

const near = (a: number, b: number, eps = 1e-6): void => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('triage_counts', () => {
  const r = renderFigure({
    kind: 'triage_counts',
    data: {
      method: 'START',
      triageCompleteAt: '10:46',
      points: [
        { time: '10:30', immediate: 3, delayed: 6, minor: 9, expectant: 1 },
        { time: '10:46', immediate: 4, delayed: 9, minor: 12, expectant: 3 },
      ],
    },
  })
  it('writes the totals and the completion time into the summary', () => {
    expect(r.summary).toContain('28 patients tagged')
    expect(r.summary).toContain('4 Immediate, 9 Delayed, 12 Minor, 3 Expectant')
    expect(r.summary).toContain('Triage complete at 10:46')
  })
  it('names every priority in the legend and the table', () => {
    for (const w of ['Immediate', 'Delayed', 'Minor', 'Expectant']) expect(r.svg).toContain(w)
    expect(r.table!.columns).toEqual([
      'Time',
      'Immediate',
      'Delayed',
      'Minor',
      'Expectant',
      'Deceased',
      'Total',
    ])
    expect(r.table!.rows[1]).toEqual(['10:46', '4', '9', '12', '3', '0', '28'])
  })
  it('uses a pattern per priority, not color alone', () => {
    expect(r.svg).toMatch(/<pattern id="pri-[a-z0-9]+-delayed"/)
    expect(r.svg).toMatch(/fill="url\(#pri-[a-z0-9]+-minor\)"/)
  })
})

describe('patient_tracking_board', () => {
  const r = renderFigure({
    kind: 'patient_tracking_board',
    data: {
      patients: [
        {
          id: 'T-001',
          priority: 'Immediate',
          location: 'Red area',
          transportTime: '10:31',
          destination: 'Trauma Center',
        },
        { id: 'T-004', priority: 'Delayed', location: 'Yellow area' },
      ],
    },
  })
  it('counts who has left and who waits', () => {
    expect(r.summary).toContain('1 have left the scene, 1 are waiting')
    expect(r.svg).toContain('Not assigned')
  })
  it('rejects an unknown priority word', () => {
    expect(() =>
      renderFigure({
        kind: 'patient_tracking_board',
        data: { patients: [{ id: 'A', priority: 'Red' }] },
      }),
    ).toThrow(/priority/)
  })
})

describe('hospital_capacity_board', () => {
  const r = renderFigure({
    kind: 'hospital_capacity_board',
    data: {
      hospitals: [
        { name: 'North Hospital', status: 'Open', edBeds: 6, received: 2, receiveLimit: 6 },
        { name: 'South Hospital', status: 'Diversion', edBeds: 0, received: 4, receiveLimit: 3 },
      ],
    },
  })
  it('marks a hospital over its stated limit in words', () => {
    expect(r.svg).toContain('Over stated limit')
    expect(r.summary).toContain('Over the stated limit: South Hospital')
  })
  it('gives status as a word', () => {
    expect(r.svg).toContain('Diversion')
    expect(r.table!.rows[1]).toEqual([
      'South Hospital',
      'Diversion',
      '0',
      'n/a',
      'n/a',
      'n/a',
      '4',
      '3',
    ])
  })
})

describe('protective action geometry', () => {
  const zone = { windFromDeg: 270, isolationDistance: 100, protectiveDistance: 400 }
  it('runs the square downwind, centred across the wind', () => {
    near(downwindBearing(270), 90)
    const [a, b, c, d] = protectiveSquare(zone)
    // Wind from the west blows east: the square extends east of the release, 400 long, 400 wide.
    near(a.x, 0)
    near(c.x, 400)
    near(Math.abs(a.y - b.y), 400)
    near(Math.abs(c.y - d.y), 400)
    near((a.y + b.y) / 2, 0)
  })
  it('turns with the wind', () => {
    const sq = protectiveSquare({ ...zone, windFromDeg: 225 })
    const far = sq[2]
    // Wind from the southwest blows northeast: the far corner is on the northeast diagonal.
    expect(far.x).toBeGreaterThan(0)
    expect(far.y).toBeGreaterThan(0)
  })
  it('grows with the entered distance', () => {
    const small = protectiveSquare(zone)
    const big = protectiveSquare({ ...zone, protectiveDistance: 800 })
    near(big[2].x, 2 * small[2].x)
  })
  it('puts places inside the right zone', () => {
    expect(insideIsolation(offsetAt(0, 50), zone)).toBe(true)
    expect(insideProtective(offsetAt(90, 300), zone)).toBe(true)
    expect(insideProtective(offsetAt(270, 300), zone)).toBe(false)
    expect(insideProtective(offsetAt(0, 300), zone)).toBe(false)
  })
  it('closes a circle ring of the right radius', () => {
    for (const p of circleRing(100)) near(Math.hypot(p.x, p.y), 100, 1e-9)
  })
  it('gives GeoJSON polygons for map overlays', () => {
    const g = zoneGeoJson(41.5, -81.7, zone, 'ft')
    expect(g.features).toHaveLength(2)
    const first = (g.features[1] as { geometry: { coordinates: number[][][] } }).geometry
      .coordinates[0]!
    expect(first[0]).toEqual(first[first.length - 1])
  })
})

describe('protective_action_zone', () => {
  const base = {
    material: 'Exercise material X-17 (fictional)',
    incident: { label: 'Tank car at Harlan Spur' },
    wind: { fromDeg: 270, speed: 8, unit: 'mph', source: 'command post sensor' },
    isolationDistance: 300,
    protectiveDistance: 1500,
    unit: 'ft',
    distanceSource: 'fictional',
    places: [
      { name: 'Elm Street school', bearingDeg: 90, distance: 1000 },
      { name: 'Mill Street clinic', bearingDeg: 270, distance: 900 },
    ],
  }
  const r = renderFigure({ kind: 'protective_action_zone', data: base })
  it('labels invented distances as invented', () => {
    expect(r.summary).toContain('invented exercise values for a fictional material')
    expect(r.svg).toContain('invented exercise values')
    expect(r.svg).toContain('use your own guidebook for real decisions')
  })
  it('reports which places fall inside which zone', () => {
    expect(r.summary).toContain('Elm Street school is inside the protective action zone')
    expect(r.summary).toContain('Mill Street clinic is outside both zones')
  })
  it('lists the numbers used in a table', () => {
    const rows = Object.fromEntries(r.table!.rows.map((x) => [x[0], x[1]]))
    expect(rows['Initial isolation distance (radius)']).toBe('300 ft')
    expect(rows['Protective action distance (square side, downwind)']).toBe('1,500 ft')
  })
  it('needs the edition when the numbers were entered from a guidebook', () => {
    expect(() =>
      renderFigure({
        kind: 'protective_action_zone',
        data: { ...base, distanceSource: 'entered' },
      }),
    ).toThrow(/edition/)
    const ok = renderFigure({
      kind: 'protective_action_zone',
      data: { ...base, distanceSource: 'entered', edition: 'ERG 2024' },
    })
    expect(ok.summary).toContain('from their own guidebook, ERG 2024')
  })
  it('is deterministic', () => {
    expect(renderFigure({ kind: 'protective_action_zone', data: base }).svg).toBe(r.svg)
  })
})

describe('toolkits name only figure kinds the app draws', () => {
  it.each(['mci_triage', 'hazmat'])('%s', (id) => {
    const toolkit = JSON.parse(readFileSync(resolve('packs/toolkits', `${id}.json`), 'utf8')) as {
      figureKinds: string[]
    }
    for (const k of toolkit.figureKinds) expect(listFigureKinds()).toContain(k)
  })
})
