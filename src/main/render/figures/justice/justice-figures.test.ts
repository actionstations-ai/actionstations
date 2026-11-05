// Justice figure kinds (spec 0465 FR-8): registered beside the generic ones, accessible,
// deterministic, with a summary and table that agree with the drawing, and bad data refused.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { renderFigure, listFigureKinds, tableHtml } = await import('../index')

interface Spec {
  kind: string
  data: Record<string, unknown>
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/figure/preview.json'), 'utf8'),
) as { variants: Record<string, { fields: { figures: { main: Spec } } }> }
const sample = (k: string): Spec => preview.variants[k]!.fields.figures.main

const KINDS = [
  'justice_unit_status',
  'justice_incident_timeline',
  'justice_jail_population',
  'justice_court_continuity',
  'justice_court_recovery',
  'justice_filings_backlog',
]

it('registers the justice kinds beside the generic ones', () => {
  expect(listFigureKinds()).toEqual(expect.arrayContaining([...KINDS, 'status_board', 'bar']))
})

describe.each(KINDS)('%s', (kind) => {
  const spec = sample(kind)
  const r = renderFigure(spec)
  it('draws an accessible SVG, the same bytes twice, with a table and a plain summary', () => {
    expect(r.svg).toMatch(/^<svg [^>]*role="img"/)
    expect(r.svg).not.toMatch(/NaN|undefined|Infinity|<script/)
    expect(renderFigure(spec).svg).toBe(r.svg)
    expect(r.table!.rows.length).toBeGreaterThan(1)
    for (const row of r.table!.rows) expect(row).toHaveLength(r.table!.columns.length)
    expect(tableHtml(r.table!)).toContain('<th scope="row">')
    expect(r.summary).not.toMatch(/[<>]/)
  })
})

describe('unit status', () => {
  const r = renderFigure(sample('justice_unit_status'))
  it('counts units by status in words and keeps locations at building level', () => {
    expect(r.summary).toMatch(
      /6 units, 2 on scene, 1 en route, 2 staged, 0 available, 1 out of service/,
    )
    expect(r.svg).toContain('On scene')
    expect(r.table!.columns).toEqual(['Unit', 'State', 'Detail'])
  })
})

describe('jail population', () => {
  const r = renderFigure(sample('justice_jail_population'))
  it('states expected, counted and which areas are not clear, with words as well as colors', () => {
    expect(r.summary).toMatch(
      /Population by housing area as of 15:20: 225 expected, 214 counted, 2 of 5 areas not yet clear/,
    )
    expect(r.summary).toContain('Housing Unit 4: Count not clear')
    expect(r.summary).toContain('Medical: Recount pending')
    expect(r.svg).toContain('Count not clear')
  })

  it('marks a clear area that exceeds its capacity as over capacity', () => {
    const over = renderFigure({
      kind: 'justice_jail_population',
      data: {
        areas: [{ area: 'Unit A', capacity: 10, expected: 12, counted: 12, countStatus: 'clear' }],
      },
    })
    expect(over.summary).toContain('Unit A: Over capacity')
  })
})

describe('court continuity', () => {
  const r = renderFigure(sample('justice_court_continuity'))
  it('measures each function against its recovery time objective', () => {
    expect(r.summary).toMatch(/30 h after the outage began: 5 essential functions, 2 down/)
    expect(r.summary).toContain('Emergency protective orders: Restored in time')
    expect(r.summary).toContain('Public website: Restored late')
    expect(r.summary).toContain('Case management system: Down')
  })

  it('says a function is past its objective once the elapsed time exceeds it', () => {
    const late = renderFigure({
      kind: 'justice_court_continuity',
      data: {
        elapsedHours: 10,
        functions: [{ function: 'E-filing', rtoHours: 4, status: 'down' }],
      },
    })
    expect(late.summary).toContain('E-filing: Down, past objective')
  })

  it('refuses a restored function with no restore time', () => {
    expect(() =>
      renderFigure({
        kind: 'justice_court_continuity',
        data: {
          elapsedHours: 5,
          functions: [{ function: 'E-filing', rtoHours: 4, status: 'restored' }],
        },
      }),
    ).toThrow(/restoredAtHours/)
  })
})

describe('refusals', () => {
  it('refuses an incident event in an unknown lane and a function restored before it went down', () => {
    expect(() =>
      renderFigure({
        kind: 'justice_incident_timeline',
        data: { events: [{ minute: 1, label: 'x', lane: 'Tactics' }] },
      }),
    ).toThrow()
    expect(() =>
      renderFigure({
        kind: 'justice_court_recovery',
        data: { functions: [{ function: 'x', downFromHours: 5, restoredAtHours: 2 }] },
      }),
    ).toThrow()
  })
})
