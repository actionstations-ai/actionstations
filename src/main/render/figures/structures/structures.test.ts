// Structures figure kinds (spec 0471 FR-5): each draws accessible SVG from the sample data of the
// figure template's preview variants, states its numbers in words and a table, and refuses
// data that contradicts the field (a muster point inside an exclusion zone, an action level
// below the alarm level).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { renderFigure, listFigureKinds, tableHtml } = await import('../index')

interface Spec {
  kind: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}
interface Preview {
  fields: { figures: { main: Spec } }
  variants: Record<string, { fields: { figures: { main: Spec } } }>
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/structures_figure/preview.json'), 'utf8'),
) as Preview
const KINDS = [
  'structures_monitoring',
  'structures_site_plan',
  'structures_status_board',
  'structures_assignment_map',
]
const sample = (k: string): Spec =>
  k === KINDS[0] ? preview.fields.figures.main : preview.variants[k]!.fields.figures.main

it('registers the structures kinds beside the generic ones', () => {
  expect(listFigureKinds()).toEqual(expect.arrayContaining([...KINDS, 'time_series']))
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

describe('structures_monitoring', () => {
  const r = renderFigure(sample('structures_monitoring'))
  it('states the levels, the unit and when each level was first reached', () => {
    expect(r.summary).toContain('alarm level 150 kN and action level 180 kN')
    expect(r.summary).toMatch(/first reached the alarm level at 2026-11-09 \d\d:\d\d UTC/)
    expect(r.summary).toMatch(/first reached the action level at/)
    expect(r.svg).toContain('Alarm level (150 kN)')
    expect(r.svg).toContain('Action level (180 kN)')
  })
  it('says when a level has not been reached', () => {
    const d = structuredClone(sample('structures_monitoring').data)
    d.actionLevel = 400
    expect(renderFigure({ kind: 'structures_monitoring', data: d }).summary).toContain(
      'has not reached the action level',
    )
  })
  it('refuses an action level below the alarm level and a figure with no level', () => {
    const d = structuredClone(sample('structures_monitoring').data)
    d.actionLevel = 100
    expect(() => renderFigure({ kind: 'structures_monitoring', data: d })).toThrow()
    delete d.actionLevel
    delete d.alarmLevel
    expect(() => renderFigure({ kind: 'structures_monitoring', data: d })).toThrow()
  })
})

describe('structures_site_plan', () => {
  const r = renderFigure(sample('structures_site_plan'))
  it('numbers every feature, with the swing radius and the exclusion zone in words', () => {
    expect(r.summary).toContain('Crane (swing radius) Tower crane TC-2')
    expect(r.summary).toContain('radius 110 ft')
    expect(r.summary).toContain('Exclusion zone Collapse exclusion zone')
    expect(r.summary).toContain('Muster point Muster point A')
    expect(r.svg).toContain('North is up')
    expect(r.table!.rows).toHaveLength(sample('structures_site_plan').data.features.length)
  })
  it('refuses a muster point inside an exclusion zone', () => {
    const d = structuredClone(sample('structures_site_plan').data)
    d.features.find((f: { type: string }) => f.type === 'muster').x = 150
    d.features.find((f: { type: string }) => f.type === 'muster').y = 100
    expect(() => renderFigure({ kind: 'structures_site_plan', data: d })).toThrow(
      /inside an exclusion zone/,
    )
  })
  it('refuses a feature outside the site', () => {
    const d = structuredClone(sample('structures_site_plan').data)
    d.features[0].x = 400
    expect(() => renderFigure({ kind: 'structures_site_plan', data: d })).toThrow(
      /outside the site/,
    )
  })
})

describe('structures_status_board', () => {
  const spec = sample('structures_status_board')
  const r = renderFigure(spec)
  it('counts the placards in words and names priority buildings not yet evaluated', () => {
    expect(r.summary).toContain('18 buildings in 3 areas')
    expect(r.summary).toContain('INSPECTED (green)')
    expect(r.summary).toContain('RESTRICTED USE (yellow)')
    expect(r.summary).toContain('UNSAFE (red)')
    expect(r.summary).toMatch(
      /Priority buildings not yet evaluated: B-0401 \(School\), B-0415 \(Shelter\)/,
    )
    for (const w of ['INSPECTED', 'RESTRICTED USE', 'UNSAFE']) expect(r.svg).toContain(`>${w}<`)
  })
  it('shows a placard as not yet evaluated before it was posted', () => {
    const early = renderFigure({
      kind: 'structures_status_board',
      data: { ...spec.data, asOf: '2026-11-06T09:00:00Z' },
    })
    expect(early.summary).toMatch(/\d+ NOT YET EVALUATED/)
    expect(early.summary).not.toEqual(r.summary)
  })
  it('shrinks the cells above sixty buildings and keeps every row in the table', () => {
    const many = {
      areas: [
        {
          name: 'A',
          buildings: Array.from({ length: 70 }, (_, i) => ({ id: `X-${i}`, placard: 'INSPECTED' })),
        },
      ],
    }
    const out = renderFigure({ kind: 'structures_status_board', data: many })
    expect(out.table!.rows).toHaveLength(70)
  })
})

describe('structures_assignment_map', () => {
  const spec = sample('structures_assignment_map')
  const r = renderFigure(spec)
  it('assigns each building to its area and labels the priority ones', () => {
    expect(r.summary).toContain('Areas: Harbor District (Team 1)')
    expect(r.svg).toContain('>B-0201<')
    expect(r.table!.rows.find((row) => row[0]?.startsWith('B-0201'))![2]).toBe('Harbor District')
  })
  it('draws the program at the time given', () => {
    const later = renderFigure({
      kind: 'structures_assignment_map',
      data: { ...spec.data, asOf: '2026-11-06T16:00:00Z' },
    })
    expect(later.summary).not.toEqual(r.summary)
  })
  it('refuses duplicate building ids', () => {
    const d = structuredClone(spec.data)
    d.buildings[1].id = d.buildings[0].id
    expect(() => renderFigure({ kind: 'structures_assignment_map', data: d })).toThrow()
  })
})
