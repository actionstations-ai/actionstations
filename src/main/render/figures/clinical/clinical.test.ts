// Clinical figure kinds (spec 0451 FR-6): each draws valid SVG from fixed fixtures, writes a
// summary with the key values, offers a data table, carries words (not color alone) and renders
// the same bytes twice. Fixtures are fictional.
import { describe, expect, it } from 'vitest'
import { getFigureKind, listFigureKinds, renderFigure } from '../index'
import { formatAge, percentDone } from './index'

const FIXTURES: Record<string, unknown> = {
  interface_status_dashboard: {
    title: 'Interface status',
    asOf: '02:47',
    feeds: [
      {
        name: 'LIS_ORU_IN',
        direction: 'inbound',
        status: 'error',
        queueDepth: 1842,
        lastMessage: '02:11:56',
        error: 'ACK timeout',
      },
      {
        name: 'EHR_ADT_OUT',
        direction: 'outbound',
        status: 'queued',
        queueDepth: 212,
        lastMessage: '02:46:40',
      },
      {
        name: 'RIS_ORM_OUT',
        direction: 'outbound',
        status: 'up',
        queueDepth: 0,
        lastMessage: '02:47:10',
      },
    ],
  },
  message_queue_series: {
    title: 'Queued messages',
    xLabel: 'Hours from downtime start',
    alertDepth: 1000,
    feeds: [
      {
        name: 'LIS_ORU_IN',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 420 },
          { x: 2, y: 1100 },
          { x: 3, y: 1842 },
        ],
      },
      {
        name: 'EHR_ADT_OUT',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 60 },
          { x: 2, y: 140 },
          { x: 3, y: 212 },
        ],
      },
    ],
  },
  unit_status_board: {
    title: 'Unit status',
    asOf: '03:00',
    units: [
      { name: '4 West', state: 'green', staffOnDowntime: 12 },
      { name: 'ED', state: 'amber', staffOnDowntime: 18, detail: 'labels short' },
      { name: 'ICU', state: 'red', staffOnDowntime: 0, detail: 'no downtime forms on unit' },
    ],
  },
  results_backlog: {
    title: 'Results backlog',
    asOf: '09:30',
    departments: [
      { name: 'Laboratory', waiting: 412, oldestMinutes: 395, critical: 9 },
      { name: 'Radiology', waiting: 38, oldestMinutes: 130, critical: 1 },
    ],
  },
  reconciliation_progress: {
    title: 'Reconciliation progress',
    unit: 'forms',
    units: [
      { name: '4 West', done: 60, remaining: 20 },
      { name: 'ED', done: 30, remaining: 90 },
    ],
  },
  downtime_timeline: {
    title: 'Downtime timeline',
    xLabel: 'Hours from detection',
    lanes: ['Command', 'Systems'],
    events: [
      { x: 0, label: 'Downtime declared', lane: 'Command' },
      { x: 3, label: 'Interface queue alert', lane: 'Systems' },
    ],
    spans: [{ from: 0, to: 6, label: 'EHR unavailable', lane: 'Systems' }],
  },
}

describe('clinical figure kinds', () => {
  it('registers every kind the toolkit names', () => {
    for (const id of Object.keys(FIXTURES)) expect(listFigureKinds(), id).toContain(id)
  })

  for (const [kind, data] of Object.entries(FIXTURES)) {
    it(`${kind}: valid SVG, summary, table, deterministic`, () => {
      const a = renderFigure({ kind, data })
      const b = renderFigure({ kind, data })
      expect(a.svg).toBe(b.svg)
      expect(a.svg.startsWith('<svg')).toBe(true)
      expect(a.svg).toContain('role="img"')
      expect(a.summary.length).toBeGreaterThan(40)
      expect(a.table?.rows.length).toBeGreaterThan(0)
      expect(getFigureKind(kind)).toBeDefined()
    })
  }

  it('interface dashboard names every status in words and the deepest queue', () => {
    const r = renderFigure({
      kind: 'interface_status_dashboard',
      data: FIXTURES.interface_status_dashboard,
    })
    expect(r.summary).toMatch(/1 running, 1 queue growing, 1 in error/)
    expect(r.summary).toMatch(/Deepest queue: LIS_ORU_IN with 1842 messages/)
    expect(r.svg).toMatch(/In error|Down/)
  })

  it('queue series reports the feeds that reach the alert depth', () => {
    const r = renderFigure({ kind: 'message_queue_series', data: FIXTURES.message_queue_series })
    expect(r.summary).toMatch(/Highest queue: LIS_ORU_IN at 1842 messages/)
    expect(r.summary).toMatch(/1 of 2 feeds reach the alert depth of 1000/)
  })

  it('unit board states what green, amber and red mean', () => {
    const r = renderFigure({ kind: 'unit_status_board', data: FIXTURES.unit_status_board })
    expect(r.summary).toMatch(
      /1 on downtime procedures \(green\), 1 partly ready \(amber\), 1 not ready \(red\)/,
    )
    expect(r.table?.rows[2]![1]).toBe('Red: Not ready')
  })

  it('results backlog totals the departments and names the oldest item', () => {
    const r = renderFigure({ kind: 'results_backlog', data: FIXTURES.results_backlog })
    expect(r.summary).toMatch(/450 results waiting across 2 departments, 10 flagged critical/)
    expect(r.summary).toMatch(/Oldest item: 6 h 35 min in Laboratory/)
  })

  it('reconciliation counts percent done per unit and overall', () => {
    const r = renderFigure({
      kind: 'reconciliation_progress',
      data: FIXTURES.reconciliation_progress,
    })
    expect(r.summary).toMatch(/45 percent complete overall \(90 forms done, 110 remaining\)/)
    expect(r.table?.rows[0]).toEqual(['4 West', '60', '20', '75%'])
  })

  it('helpers format ages and percentages', () => {
    expect(formatAge(45)).toBe('45 min')
    expect(formatAge(125)).toBe('2 h 05 min')
    expect(percentDone(0, 0)).toBe(100)
    expect(percentDone(1, 3)).toBe(25)
  })

  it('rejects bad data with the kind named', () => {
    expect(() => renderFigure({ kind: 'results_backlog', data: { departments: [] } })).toThrow()
  })
})
