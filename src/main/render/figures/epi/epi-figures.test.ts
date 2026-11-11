// The epidemiology figure kinds (#836): each draws valid SVG from simulation-built data, writes a
// summary with the key values, offers a data table, never relies on color alone, and renders the
// same bytes twice. The SVG of each fixture is kept as a file snapshot for review.
import { describe, expect, it } from 'vitest'
import { runCompartment } from '../../../toolkits/epidemiology/simulate/compartment'
import { generateCommonSource } from '../../../toolkits/epidemiology/simulate/common-source'
import { generateContactNetwork } from '../../../toolkits/epidemiology/simulate/contacts'
import {
  generateWastewater,
  runDispensing,
} from '../../../toolkits/epidemiology/simulate/wastewater-dispensing'
import {
  attackRatesDataFromOutbreak,
  curveDataFromOutbreak,
  dispensingDataFromRun,
  lineListDataFromOutbreak,
  networkDataFromContacts,
  wastewaterDataFromSim,
} from '../../../toolkits/epidemiology/figure-data'
import { histogram } from '../../../toolkits/epidemiology/lint'
import { listFigureKinds, renderFigure } from '../index'
import { EPI_FIGURE_KINDS } from './index'
import { curveBins, smoothTotals, type EpiCurveData } from './curve'

const outbreak = generateCommonSource({ seed: 1 })
const contacts = generateContactNetwork({ seed: 3 })
const sim = runCompartment({ population: 20_000, r0: 2.2, days: 60 })
const water = generateWastewater({
  incidence: sim.days.map((d) => d.newOnsets),
  lagDays: 3,
  noiseSigma: 0,
})
const dispensing = runDispensing({ seed: 2, hoursOpen: 6 })

const FIXTURES: Record<string, unknown> = {
  epi_curve: curveDataFromOutbreak(outbreak, {
    binHours: 6,
    title: 'Illness onset after the Harvest Hall reception',
    markers: [
      { time: '2026-10-17T18:00:00Z', label: 'Reception begins', kind: 'exposure' },
      {
        time: '2026-10-19T14:00:00Z',
        label: 'Venue closed by the health department',
        kind: 'intervention',
      },
    ],
  }),
  epi_line_list: lineListDataFromOutbreak(outbreak, {
    title: 'Line list',
    setting: 'Harvest Hall',
  }),
  epi_attack_rates: attackRatesDataFromOutbreak(outbreak, 'Attack rates by food'),
  epi_spot_map: {
    title: 'Residence of cases',
    points: outbreak.cases.slice(0, 30).map((c, i) => ({
      lon: -81.7 + ((i * 37) % 100) / 1000,
      lat: 41.45 + ((i * 53) % 100) / 1000,
      status: c.status,
    })),
    sites: [{ lon: -81.65, lat: 41.5, label: 'Harvest Hall (fictional venue)' }],
  },
  epi_contact_network: networkDataFromContacts(contacts, {
    title: 'Contacts of the index case',
    maxContacts: 24,
  }),
  epi_lab_board: {
    title: 'Laboratory surge board',
    asOf: '2026-10-22T16:00:00Z',
    rows: [
      {
        name: 'Public health laboratory',
        received: 240,
        pending: 90,
        positive: 41,
        turnaroundHours: 52,
        targetHours: 24,
      },
      {
        name: 'Hospital laboratory A',
        received: 180,
        pending: 30,
        positive: 22,
        turnaroundHours: 14,
        targetHours: 24,
      },
      {
        name: 'Reference laboratory (referral)',
        received: 60,
        pending: 60,
        positive: 0,
        targetHours: 72,
      },
    ],
  },
  epi_dispensing: dispensingDataFromRun(dispensing, {
    title: 'Dispensing site throughput',
    stations: 10,
    intervalMinutes: 15,
    planPerHour: 300,
  }),
  epi_wastewater: wastewaterDataFromSim(water, {
    startDate: '2026-10-01T00:00:00Z',
    title: 'Simulated wastewater signal',
    site: 'Riverbend plant (fictional)',
    pathogen: 'Virus X',
    levels: [
      { name: 'low', from: 15 },
      { name: 'moderate', from: 30 },
      { name: 'high', from: 60 },
    ],
  }),
}

describe('epi figure kinds', () => {
  it('registers every kind the toolkit names, once', () => {
    const ids = EPI_FIGURE_KINDS.map((k) => k.kind)
    expect(ids).toEqual(Object.keys(FIXTURES))
    for (const id of ids) expect(listFigureKinds()).toContain(id)
  })

  it.each(Object.keys(FIXTURES))('%s draws valid, repeatable, accessible output', async (kind) => {
    const spec = { kind, data: FIXTURES[kind] }
    const a = renderFigure(spec)
    expect(a.svg.startsWith('<svg')).toBe(true)
    expect(a.svg).toContain('role="img"')
    expect(a.svg).toMatch(/<title id="[^"]+">/)
    expect(a.svg).not.toMatch(/<image|<script|href=|onload|data:/)
    expect(a.svg.match(/<svg/g)).toHaveLength(1)
    expect(a.summary.length).toBeGreaterThan(40)
    expect(a.table?.rows.length).toBeGreaterThan(0)
    for (const row of a.table!.rows) expect(row).toHaveLength(a.table!.columns.length)
    expect(renderFigure(spec).svg).toBe(a.svg)
    await expect(a.svg).toMatchFileSnapshot(`./__snapshots__/${kind}.svg`)
  })

  it('rejects data that does not fit a kind', () => {
    expect(() => renderFigure({ kind: 'epi_curve', data: { start: 'nope', cases: [] } })).toThrow(
      /not valid/,
    )
    expect(() =>
      renderFigure({
        kind: 'epi_contact_network',
        data: {
          nodes: [{ id: 'a', generation: 0, status: 'index' }],
          edges: [{ from: 'a', to: 'b' }],
        },
      }),
    ).toThrow(/edge/)
    expect(() =>
      renderFigure({
        kind: 'epi_lab_board',
        data: { rows: [{ name: 'x', received: 5, pending: 4, positive: 4, targetHours: 24 }] },
      }),
    ).toThrow(/pending plus positive/)
  })
})

describe('epi_curve', () => {
  const data = FIXTURES.epi_curve as EpiCurveData

  it('counts cases by onset: the bins equal the onset histogram of the line list', () => {
    const parsed = renderFigure({ kind: 'epi_curve', data })
    const bins = curveBins(data as never)
    const expected = histogram(
      outbreak.cases.map((c) => ({ onsetMs: c.onsetMs!, reportedMs: c.reportedMs! })),
      'onsetMs',
      bins[0]!.startMs,
      6 * 3_600_000,
      bins.length,
    )
    expect(bins.map((b) => b.total)).toEqual(expected)
    expect(bins.reduce((s, b) => s + b.total, 0)).toBe(outbreak.cases.length)
    expect(parsed.summary).toContain(`${outbreak.cases.length} cases`)
  })

  it('names the peak, the tiers and the markers in the summary', () => {
    const { summary } = renderFigure({ kind: 'epi_curve', data })
    expect(summary).toMatch(/Peak \d+ cases in the bin starting/)
    expect(summary).toMatch(/\d+ confirmed, \d+ probable, \d+ suspect/)
    expect(summary).toContain('Marker 1, exposure')
    expect(summary).toContain('Marker 2, control measure')
  })

  it('draws a smoothed overlay only when asked, as the moving average of the totals', () => {
    const plain = renderFigure({ kind: 'epi_curve', data }).svg
    const smooth = renderFigure({ kind: 'epi_curve', data: { ...data, smooth: true } }).svg
    expect(plain).not.toContain('<polyline')
    expect(smooth).toContain('<polyline')
    const bins = curveBins(data as never)
    const sm = smoothTotals(bins)
    expect(sm[1]).toBeCloseTo((bins[0]!.total + bins[1]!.total + bins[2]!.total) / 3, 10)
  })

  it('shades status by pattern as well as color', () => {
    const { svg } = renderFigure({ kind: 'epi_curve', data })
    expect(svg).toContain('<pattern')
    expect(svg).toMatch(/Confirmed \(\d+\)/)
  })

  it('titles both axes: number of cases against date or time of illness onset', () => {
    const { svg } = renderFigure({ kind: 'epi_curve', data })
    expect(svg).toContain('Number of cases')
    expect(svg).toMatch(/Time of illness onset \(UTC\), 6-hour intervals/)
    const daily = renderFigure({ kind: 'epi_curve', data: { ...data, binHours: 24 } })
    expect(daily.svg).toMatch(/Date of illness onset \(UTC\), 1-day intervals/)
  })

  it('takes pre-counted bins and refuses both inputs at once', () => {
    const counts = [
      { start: '2026-10-01T00:00:00Z', confirmed: 2 },
      { start: '2026-10-02T00:00:00Z', confirmed: 5, probable: 1 },
    ]
    const r = renderFigure({ kind: 'epi_curve', data: { start: '2026-10-01T00:00:00Z', counts } })
    expect(r.summary).toContain('8 cases')
    expect(() =>
      renderFigure({
        kind: 'epi_curve',
        data: { start: '2026-10-01T00:00:00Z', counts, cases: [] },
      }),
    ).toThrow()
  })
})

describe('epi tables', () => {
  it('hides identifiers behind row numbers and says the list is simulated', () => {
    const r = renderFigure({
      kind: 'epi_line_list',
      data: lineListDataFromOutbreak(outbreak, { identifiers: 'hidden' }),
    })
    expect(r.table!.columns[0]).toBe('Row')
    expect(r.table!.rows[0]![0]).toBe('1')
    expect(r.summary).toContain('Identifiers are hidden')
    expect(r.summary).toContain('Simulated line list')
    expect(r.table!.columns).not.toContain('Name')
  })

  it('sorts the line list by onset and shows names only on request', () => {
    const r = renderFigure({
      kind: 'epi_line_list',
      data: lineListDataFromOutbreak(outbreak, { identifiers: 'names' }),
    })
    const onsets = r.table!.rows.map((row) => row[r.table!.columns.indexOf('Onset (UTC)')]!)
    expect(onsets).toEqual([...onsets].sort())
    expect(r.table!.columns).toContain('Name')
  })

  it('marks the true vehicle as the highest odds ratio', () => {
    const r = renderFigure({
      kind: 'epi_attack_rates',
      data: attackRatesDataFromOutbreak(outbreak),
    })
    const flagged = r.table!.rows.filter((row) => row[0]!.includes('highest odds ratio'))
    expect(flagged).toHaveLength(1)
    expect(flagged[0]![0]).toContain('chicken salad')
    expect(r.summary).toMatch(/Highest odds ratio: chicken salad/)
  })
})

describe('epi_contact_network', () => {
  it('counts unreachable contacts in the summary and keeps a status word for each node', () => {
    const data = networkDataFromContacts(contacts, { maxContacts: 40 }) as {
      nodes: { status: string }[]
    }
    const r = renderFigure({ kind: 'epi_contact_network', data })
    const unreachable = data.nodes.filter((x) => x.status === 'unreachable').length
    expect(r.summary).toContain(`${unreachable} unreachable`)
    expect(r.svg).toContain('Index case (1)')
    for (const row of r.table!.rows) expect(row[2]).toMatch(/Index case|Case|Contact/)
  })
})

describe('epi_lab_board', () => {
  it('names the streams over their turnaround target', () => {
    const r = renderFigure({ kind: 'epi_lab_board', data: FIXTURES.epi_lab_board })
    expect(r.summary).toContain('Over the turnaround target: Public health laboratory.')
    expect(r.table!.rows[0]![7]).toBe('Over target by 28 h')
    expect(r.table!.rows[1]![7]).toBe('Within target')
    expect(r.table!.rows[2]![7]).toBe('No completed result yet')
  })
})

describe('epi_dispensing and epi_wastewater', () => {
  it('states throughput against plan', () => {
    const r = renderFigure({ kind: 'epi_dispensing', data: FIXTURES.epi_dispensing })
    expect(r.summary).toMatch(/people per hour against a plan of 300/)
    expect(r.summary).toMatch(/queue peaks at/)
  })

  it('shows the scale as published and the origin of the data', () => {
    const r = renderFigure({ kind: 'epi_wastewater', data: FIXTURES.epi_wastewater })
    expect(r.summary).toContain('Origin: Simulated by Action Stations')
    expect(r.summary).toContain(
      'Levels as published with the data: low from 15, moderate from 30, high from 60',
    )
    expect(() =>
      renderFigure({
        kind: 'epi_wastewater',
        data: { ...(FIXTURES.epi_wastewater as object), origin: '' },
      }),
    ).toThrow()
  })
})
