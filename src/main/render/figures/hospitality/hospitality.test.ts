// The hospitality figure kinds (#837): they register beside the generic kinds, draw accessible
// SVG from simulation-built data, state their numbers in a summary and a table that agree with
// the drawing, render the same bytes twice, and refuse bad data.
import { describe, expect, it } from 'vitest'
import {
  departuresData,
  floorStatusData,
  musterBoardData,
  outbreakCurveData,
} from '../../../toolkits/hospitality/figure-data'
import {
  simulateHurricane,
  simulateMuster,
  simulateTowerFire,
} from '../../../toolkits/hospitality/simulate/emergencies'
import { simulateOutbreak } from '../../../toolkits/hospitality/simulate/outbreak'
import { listFigureKinds, renderFigure } from '../index'
import { HOSPITALITY_FIGURE_KINDS } from './index'
import { cumulativeRows, firstDayAt } from './outbreak'

const outbreak = simulateOutbreak({ seed: 2 })
const muster = simulateMuster({ seed: 2 })
const fire = simulateTowerFire({ seed: 2 })
const storm = simulateHurricane({ seed: 2 })

const FIXTURES: Record<string, unknown> = {
  hosp_outbreak_curve: outbreakCurveData(outbreak, 'Cases on the 7-night voyage'),
  hosp_muster_board: musterBoardData(muster, 12, 'Muster count at minute 12'),
  hosp_floor_status: floorStatusData(fire, 20, 'North Tower at minute 20'),
  hosp_departures_timeline: departuresData(storm, 'Guest departures before the storm'),
  hosp_port_board: {
    title: 'Itinerary ports',
    asOf: '2026-09-17T12:00:00Z',
    ports: [
      { port: 'Port Canaveral', eta: 'Sat 06:30', status: 'open' },
      {
        port: 'Nassau',
        eta: 'Mon 08:00',
        status: 'restricted',
        note: 'Pilot service suspended after 18:00',
      },
      { port: 'Freeport', eta: 'Tue 08:00', status: 'closed', note: 'Port closed to traffic' },
    ],
  },
}

describe('registration', () => {
  it('registers every kind beside the generic ones', () => {
    const ids = listFigureKinds()
    for (const k of HOSPITALITY_FIGURE_KINDS) expect(ids).toContain(k.kind)
    expect(ids).toContain('time_series')
    expect(Object.keys(FIXTURES).sort()).toEqual(HOSPITALITY_FIGURE_KINDS.map((k) => k.kind).sort())
  })
})

describe.each(Object.entries(FIXTURES))('%s', (kind, data) => {
  const out = renderFigure({ kind, data })

  it('draws an accessible SVG with a title, a description and the summary', () => {
    expect(out.svg).toMatch(/^<svg[^>]*role="img"/)
    expect(out.svg).toContain('<title')
    expect(out.svg).toContain('<desc')
    expect(out.summary.length).toBeGreaterThan(40)
  })

  it('renders the same bytes twice', () => {
    expect(renderFigure({ kind, data }).svg).toBe(out.svg)
  })

  it('offers a data table', () => {
    expect(out.table?.rows.length).toBeGreaterThan(0)
  })
})

describe('outbreak curve', () => {
  const rows = cumulativeRows(outbreakCurveData(outbreak))

  it('never falls and ends at the simulation total', () => {
    for (let i = 1; i < rows.length; i++)
      expect(rows[i]!.passengerCases).toBeGreaterThanOrEqual(rows[i - 1]!.passengerCases)
    const total = outbreak.cases.filter((c) => c.group === 'passengers').length
    expect(rows[rows.length - 1]!.passengerCases).toBe(total)
  })

  it('says the day each level is reached, matching the crossings', () => {
    const out = renderFigure({ kind: 'hosp_outbreak_curve', data: FIXTURES.hosp_outbreak_curve })
    const day2 = firstDayAt(rows, 'passenger', 2)
    expect(day2).toBeDefined()
    expect(out.summary).toContain(`passengers reach 2 percent on day ${day2}`)
    const crossing = outbreak.crossings.find((c) => c.group === 'passengers' && c.level === 2)!
    expect(Math.floor((crossing.timeMs - outbreak.startMs) / 86_400_000) + 1).toBe(day2)
  })

  it('names the levels in words in the table, not by color', () => {
    const out = renderFigure({ kind: 'hosp_outbreak_curve', data: FIXTURES.hosp_outbreak_curve })
    expect(out.table!.rows.flat().join(' ')).toMatch(/percent or more|Below 2 percent/)
  })
})

describe('accounting boards', () => {
  it('muster summary and table agree on the totals', () => {
    const out = renderFigure({ kind: 'hosp_muster_board', data: FIXTURES.hosp_muster_board })
    const open = out.table!.rows.reduce((s, r) => s + Number(r[3]), 0)
    expect(out.summary).toContain(`${open} not accounted for`)
  })

  it('floor status counts every floor', () => {
    const out = renderFigure({ kind: 'hosp_floor_status', data: FIXTURES.hosp_floor_status })
    expect(out.table!.rows).toHaveLength(fire.floors.length)
  })
})

describe('bad data is refused', () => {
  it('rejects more mustered than expected and more accounted than registered', () => {
    expect(() =>
      renderFigure({
        kind: 'hosp_muster_board',
        data: { rows: [{ name: 'Crew', expected: 10, mustered: 11 }] },
      }),
    ).toThrow()
    expect(() =>
      renderFigure({
        kind: 'hosp_floor_status',
        data: { floors: [{ floor: '3', registered: 5, accounted: 9, state: 'clear' }] },
      }),
    ).toThrow()
  })

  it('rejects an outbreak with no days', () => {
    expect(() =>
      renderFigure({
        kind: 'hosp_outbreak_curve',
        data: { passengersOnBoard: 100, crewOnBoard: 10, days: [] },
      }),
    ).toThrow()
  })
})
