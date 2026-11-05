// The human services figure kinds (spec 0464 FR-7): each draws valid SVG from simulation-built
// data, writes a summary with the key values, offers a data table, never relies on color alone,
// renders the same bytes twice and refuses bad data.
import { describe, expect, it } from 'vitest'
import {
  contactSeriesData,
  displacedTrackerData,
  queueBoardData,
  reunificationFlowData,
  shelterDashboardData,
  staffingCoverageData,
} from '../../../toolkits/human-services/figure-data'
import { runSurge } from '../../../toolkits/human-services/simulate/contact-surge'
import { runDisplaced } from '../../../toolkits/human-services/simulate/displaced'
import { runReunification } from '../../../toolkits/human-services/simulate/reunification'
import { runShelters } from '../../../toolkits/human-services/simulate/shelter'
import { getFigureKind, listFigureKinds, renderFigure } from '../index'
import { HS_FIGURE_KINDS } from './index'

const surge = runSurge({ seed: 1, multiplier: 2.5, hours: 10 })
const shelters = runShelters({ seed: 1, evacuees: 520 })
const reunion = runReunification({ seed: 2 })
const displaced = runDisplaced({ seed: 3 })

export const HS_FIXTURES: Record<string, unknown> = {
  hs_contact_series: {
    ...contactSeriesData(surge, 'answer_rate'),
    title: 'Answer rate by contact type (simulated)',
  },
  hs_queue_board: { ...queueBoardData(surge, 360), title: 'Queue and wait times (simulated)' },
  hs_staffing_coverage: { ...staffingCoverageData(surge), title: 'Staffing coverage (simulated)' },
  hs_shelter_dashboard: {
    ...shelterDashboardData(shelters, 20),
    title: 'Shelter dashboard (simulated)',
    supplies: [
      { item: 'Generator fuel', state: 'low', detail: '9 hours at current load' },
      { item: 'Meals', state: 'ok' },
    ],
  },
  hs_shelter_map: {
    title: 'Open shelters and electricity-dependent residents (simulated)',
    shelters: [
      {
        name: 'Eastside High School',
        lon: -81.62,
        lat: 41.5,
        status: 'open',
        population: 186,
        capacity: 220,
      },
      {
        name: 'Bayfront Community Center',
        lon: -81.7,
        lat: 41.48,
        status: 'full',
        population: 120,
        capacity: 120,
      },
      {
        name: 'Ridge Middle School',
        lon: -81.66,
        lat: 41.56,
        status: 'open',
        population: 64,
        capacity: 300,
      },
    ],
    overlay: {
      label: 'Medicare beneficiaries who use electricity-dependent equipment, simulated counts',
      origin: 'Simulated',
      areas: [
        { name: 'East Bay', lon: -81.61, lat: 41.49, count: 1840 },
        { name: 'Downtown', lon: -81.69, lat: 41.5, count: 920 },
        { name: 'North Ridge', lon: -81.65, lat: 41.57, count: 410 },
      ],
    },
  },
  hs_reunification_flow: {
    ...reunificationFlowData(reunion),
    title: 'Reunification flow (simulated)',
  },
  hs_displaced_tracker: {
    ...displacedTrackerData(displaced, 24),
    title: 'Children in care: contact status (simulated)',
  },
}

describe('human services figure kinds', () => {
  it('register beside the generic kinds with stable ids', () => {
    const ids = listFigureKinds()
    for (const k of HS_FIGURE_KINDS) expect(ids).toContain(k.kind)
    expect(HS_FIGURE_KINDS.map((k) => k.kind).sort()).toEqual(Object.keys(HS_FIXTURES).sort())
    expect(ids).toContain('time_series')
  })

  it.each(Object.keys(HS_FIXTURES))(
    '%s draws accessible SVG with a summary and a table',
    (kind) => {
      const out = renderFigure({ kind, data: HS_FIXTURES[kind] })
      expect(out.svg).toMatch(/^<svg [^>]*role="img"/)
      expect(out.svg).toContain('<title')
      expect(out.svg).toContain('<desc')
      expect(out.svg).not.toMatch(/<script|onload=|href="http/)
      expect(out.summary.length).toBeGreaterThan(60)
      expect(out.table?.rows.length).toBeGreaterThan(0)
      for (const row of out.table!.rows) expect(row.length).toBe(out.table!.columns.length)
    },
  )

  it.each(Object.keys(HS_FIXTURES))('%s renders the same bytes twice', (kind) => {
    const a = renderFigure({ kind, data: HS_FIXTURES[kind] })
    const b = renderFigure({ kind, data: HS_FIXTURES[kind] })
    expect(a.svg).toBe(b.svg)
    expect(a.summary).toBe(b.summary)
  })

  it('states the answer rate against the labeled target', () => {
    const out = renderFigure({ kind: 'hs_contact_series', data: HS_FIXTURES.hs_contact_series })
    expect(out.summary).toMatch(/Origin: Simulated/)
    expect(out.summary).toMatch(/answer rate is lowest at/)
    expect(out.summary).toMatch(/Federal goal for texts and chats \(September 2026\)/)
  })

  it('writes the queue state as a word and names the longest wait', () => {
    const out = renderFigure({ kind: 'hs_queue_board', data: HS_FIXTURES.hs_queue_board })
    expect(out.summary).toMatch(/(NORMAL|WATCH|CRITICAL)/)
    expect(out.summary).toMatch(/Longest wait: \w+ at \d+:\d\d/)
    expect(out.table!.columns).toContain('State')
  })

  it('states the staffing gap and how needed was set', () => {
    const out = renderFigure({
      kind: 'hs_staffing_coverage',
      data: HS_FIXTURES.hs_staffing_coverage,
    })
    expect(out.summary).toMatch(/Needed is based on/)
    expect(out.summary).toMatch(/(intervals are short|Every interval is staffed)/)
  })

  it('writes shelter status and supplies as words with the counts', () => {
    const out = renderFigure({
      kind: 'hs_shelter_dashboard',
      data: HS_FIXTURES.hs_shelter_dashboard,
    })
    expect(out.svg).toMatch(/OPEN|FULL/)
    expect(out.svg).toContain('LOW')
    expect(out.summary).toMatch(/residents against \d+ spaces/)
    expect(out.summary).toContain('Generator fuel LOW')
  })

  it('labels the shelter map schematic, simulated and writes each overlay count', () => {
    const out = renderFigure({ kind: 'hs_shelter_map', data: HS_FIXTURES.hs_shelter_map })
    expect(out.svg).toContain('Schematic, no basemap. Positions are simulated.')
    expect(out.summary).toContain('East Bay 1,840')
    expect(out.svg).toContain('East Bay: 1,840')
  })

  it('states pending and exceptions in the reunification flow', () => {
    const out = renderFigure({
      kind: 'hs_reunification_flow',
      data: HS_FIXTURES.hs_reunification_flow,
    })
    expect(out.summary).toMatch(/students released, \d+ pending, \d+ exceptions/)
  })

  it('totals the displaced children by status', () => {
    const out = renderFigure({
      kind: 'hs_displaced_tracker',
      data: HS_FIXTURES.hs_displaced_tracker,
    })
    expect(out.summary).toMatch(/86 children in care/)
    expect(out.summary).toMatch(/\d+ unknown/)
  })

  it('refuses bad data with the figure named', () => {
    expect(() =>
      renderFigure({ kind: 'hs_contact_series', data: { measure: 'volume', types: [] } }),
    ).toThrow()
    expect(() =>
      renderFigure({
        kind: 'hs_reunification_flow',
        data: {
          onRoster: 5,
          points: [
            { minute: 0, arrived: 6, verified: 0, released: 0 },
            { minute: 10, arrived: 6, verified: 0, released: 0 },
          ],
        },
      }),
    ).toThrow()
    expect(() => renderFigure({ kind: 'hs_shelter_dashboard', data: { sites: [] } })).toThrow()
    expect(getFigureKind('hs_queue_board')).toBeDefined()
  })
})
