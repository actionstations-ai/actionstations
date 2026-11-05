// Figure kinds (spec 0448 FR-4..FR-6, ADR-0075): each generic kind draws valid SVG from its data,
// writes a summary that carries the key values, offers a data table, never relies on color alone,
// and renders the same bytes twice. The sample data is the figure template's preview.json.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const {
  computeFigures,
  FigureOutput,
  getFigureKind,
  listFigureKinds,
  registerFigureKind,
  renderFigure,
  tableHtml,
} = await import('./index')
const { composeDocument } = await import('../compose')
const { injectText } = await import('../../export/text-rendition')

interface Preview {
  fields: { figures: { main: { kind: string; data: unknown } } }
  variants: Record<string, { fields: Preview['fields'] }>
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/figure/preview.json'), 'utf8'),
) as Preview

/** The sample spec for a kind. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sample = (kind: string): { kind: string; data: any } =>
  (kind === 'time_series' ? preview.fields : preview.variants[kind]!.fields).figures.main

const KINDS = [
  'time_series',
  'bar',
  'stacked_bar',
  'gauge',
  'status_board',
  'table',
  'annotated_timeline',
]

describe('registry', () => {
  it('has every generic kind', () => {
    expect(listFigureKinds()).toEqual([...KINDS].sort())
  })
  it('lets another module add a kind, once', () => {
    const kind = {
      kind: 'test_kind',
      schema: z.object({ n: z.number() }),
      render: (d: { n: number }) => ({ svg: '<svg/>', summary: `n is ${d.n}` }),
    }
    registerFigureKind(kind)
    registerFigureKind(kind)
    expect(renderFigure({ kind: 'test_kind', data: { n: 3 } }).summary).toBe('n is 3')
    expect(() => registerFigureKind({ ...kind })).toThrow(/already registered/)
  })
  it('names the unknown kind and the known ones', () => {
    expect(() => renderFigure({ kind: 'radar', data: {} })).toThrow(
      /Unknown figure kind "radar".*gauge/,
    )
  })
  it('reports where the data is wrong', () => {
    expect(() => renderFigure({ kind: 'bar', data: { bars: [] } })).toThrow(/bars/)
  })
})

describe.each(KINDS)('%s', (kind) => {
  const spec = sample(kind)
  const result = renderFigure(spec)

  it('draws an accessible SVG with the summary as its description', () => {
    expect(result.svg).toMatch(/^<svg [^>]*role="img"/)
    expect(result.svg).toMatch(/<title id="ft-[a-z0-9]+">/)
    expect(result.svg).toContain(`<desc id=`)
    expect(result.svg).toContain('</svg>')
    expect(result.svg).not.toMatch(/<script|onload=|href="http/i)
    expect(result.svg).not.toMatch(/NaN|undefined|Infinity/)
  })
  it('is deterministic', () => {
    expect(renderFigure(spec).svg).toBe(result.svg)
  })
  it('offers a data table with one cell per column', () => {
    expect(result.table).toBeDefined()
    const t = result.table!
    expect(t.rows.length).toBeGreaterThan(0)
    for (const r of t.rows) expect(r).toHaveLength(t.columns.length)
    const html = tableHtml(t)
    expect(html).toContain('<th scope="col">')
    expect(html).toContain('<th scope="row">')
  })
  it('has a summary that is plain text', () => {
    expect(result.summary.length).toBeGreaterThan(40)
    expect(result.summary).not.toMatch(/[<>]/)
  })
})

describe('time_series', () => {
  const r = renderFigure(sample('time_series'))
  it('summarises each series, the threshold crossing and the notes', () => {
    expect(r.summary).toContain(
      'Inflow goes from 12 m3/s at 0 to 49 m3/s at 120, peaking at 52 m3/s at 100',
    )
    expect(r.summary).toContain('Inflow reaches Notify downstream (40 m3/s) at 80')
    expect(r.summary).toContain('Spillway release reaches Notify downstream (40 m3/s) at 120')
    expect(r.summary).toContain('Note 2 at 85: Spillway gate 2 opened to 60 percent')
  })
  it('separates series by dash and marker as well as color', () => {
    expect(r.svg).toMatch(/stroke-dasharray="7 4"/)
    expect(r.svg).toContain('<rect') // square markers for series two
    expect(r.svg).toContain('Notify downstream (40 m3/s)')
  })
  it('lays out one table row per x with a column per series', () => {
    expect(r.table!.columns).toEqual([
      'Minutes since STARTEX',
      'Inflow (m3/s)',
      'Spillway release (m3/s)',
    ])
    expect(r.table!.rows[3]).toEqual(['60', '31', '18'])
  })
  it('draws date-time x values on a time axis', () => {
    const d = renderFigure({
      kind: 'time_series',
      data: {
        series: [
          {
            name: 'Stage',
            points: [
              { x: '2026-03-14T18:00:00Z', y: 2.1 },
              { x: '2026-03-14T20:00:00Z', y: 3.4 },
            ],
          },
        ],
      },
    })
    expect(d.summary).toContain('2026-03-14 18:00 UTC')
    expect(d.table!.rows[1]![0]).toBe('2026-03-14 20:00 UTC')
  })
  it('refuses mixed number and date x values', () => {
    expect(() =>
      renderFigure({
        kind: 'time_series',
        data: {
          series: [
            {
              name: 'a',
              points: [
                { x: 1, y: 1 },
                { x: '2026-03-14T18:00:00Z', y: 2 },
              ],
            },
          ],
        },
      }),
    ).toThrow(/all numbers or all date-time/)
  })
})

describe('bar and stacked_bar', () => {
  it('writes every value on the bar chart and names the highest', () => {
    const r = renderFigure(sample('bar'))
    expect(r.summary).toContain('09:00 118')
    expect(r.summary).toContain('Highest: 09:00')
    expect(r.svg).toContain('>118</text>')
  })
  it('stacks segments with a pattern each, totals above, and a total column', () => {
    const r = renderFigure(sample('stacked_bar'))
    expect(r.svg).toMatch(/<pattern id="p[a-z0-9]+-2"/)
    expect(r.summary).toContain('Harbor total 33 (Emergency 14, Urgent 10, Routine 9)')
    expect(r.table!.columns).toEqual(['Category', 'Emergency', 'Urgent', 'Routine', 'Total'])
    expect(r.table!.rows[2]).toEqual(['Harbor', '14', '10', '9', '33'])
  })
  it('requires one value per category', () => {
    expect(() =>
      renderFigure({
        kind: 'stacked_bar',
        data: { categories: ['a', 'b'], series: [{ name: 's', values: [1] }] },
      }),
    ).toThrow(/one value per category/)
  })
})

describe('gauge', () => {
  const r = renderFigure(sample('gauge'))
  it('says which band the reading is in and what the bands are', () => {
    expect(r.summary).toContain('Free chlorine reads 0.42 mg/L on a scale from 0 to 4 mg/L')
    expect(r.summary).toContain('in the band Below minimum (Down)')
    expect(r.summary).toContain('Target range 1 to 3')
  })
  it('marks the current band in the table and labels bands in the legend', () => {
    expect(r.table!.rows[0]![4]).toBe('Yes')
    expect(r.svg).toContain('Target range: 1 to 3 mg/L - Operational')
  })
  it('rejects a scale with no width', () => {
    expect(() =>
      renderFigure({ kind: 'gauge', data: { label: 'x', value: 1, min: 5, max: 5 } }),
    ).toThrow(/max must be greater than min/)
  })
})

describe('status_board', () => {
  const r = renderFigure(sample('status_board'))
  it('counts the states and lists each system', () => {
    expect(r.summary).toContain('4 systems, 1 down, 1 degraded, 1 unknown, 1 operational')
    expect(r.summary).toContain(
      'Pump station 4 controller: Down (No response since 14:47; crew on the way)',
    )
  })
  it('gives each state a word and a symbol, not only a color', () => {
    for (const word of ['Operational', 'Degraded', 'Down', 'Unknown'])
      expect(r.svg).toContain(`>${word}</text>`)
    expect(r.svg).toMatch(/<path d="M[^"]+Z" fill="#8a5a00"/) // triangle for degraded
  })
  it('sizes itself to its rows', () => {
    const short = renderFigure({
      kind: 'status_board',
      data: { rows: [{ name: 'A', state: 'ok' }] },
    })
    expect(short.svg).toMatch(/viewBox="0 0 760 [0-9.]+"/)
    expect(short.svg).not.toBe(r.svg)
  })
})

describe('table', () => {
  const r = renderFigure(sample('table'))
  it('keeps the cells as text and summarises the first rows', () => {
    expect(r.table!.rows[1]).toEqual([
      'Harbor Rec Center',
      '150',
      '150',
      '31',
      'Full; diverting arrivals to Eastgate',
    ])
    expect(r.summary).toContain(
      'table with 3 rows and columns Shelter, Capacity, Present, Pets, Notes',
    )
  })
  it('aligns number columns right', () => {
    expect(r.svg).toMatch(/text-anchor="end"[^>]*>187<|>187<\/text>/)
    expect(r.svg).toContain('text-anchor="end"')
  })
  it('requires one cell per column', () => {
    expect(() =>
      renderFigure({ kind: 'table', data: { columns: ['a', 'b'], rows: [['x']] } }),
    ).toThrow(/one cell per column/)
  })
})

describe('annotated_timeline', () => {
  const r = renderFigure(sample('annotated_timeline'))
  it('numbers events in time order and keys them', () => {
    expect(r.summary).toContain('5 events and 2 spans on 3 lanes')
    expect(r.summary).toContain('2. 22: Crew dispatched (ETA 40 min).')
    expect(r.svg).toContain('4. 70 - Boil notice drafted')
  })
  it('puts spans in the table after the events', () => {
    expect(r.table!.rows.at(-1)).toEqual(['Span', '40 to 110', 'Logistics', 'Tanker staging', ''])
  })
  it('refuses a span that ends before it starts', () => {
    expect(() =>
      renderFigure({
        kind: 'annotated_timeline',
        data: { spans: [{ from: 10, to: 5, label: 'x' }] },
      }),
    ).toThrow(/end after it starts/)
  })
})

describe('markup safety', () => {
  it('escapes text from the data in the SVG and the table', () => {
    const r = renderFigure({
      kind: 'bar',
      data: { title: '<img src=x onerror=alert(1)>', bars: [{ label: 'a"b<c', value: 1 }] },
    })
    expect(r.svg).not.toContain('<img')
    expect(r.svg).toContain('&lt;img')
    expect(tableHtml(r.table!)).toContain('a&quot;b&lt;c')
  })
})

describe('template context', () => {
  it('computes figures beside derived from fields.figures', () => {
    const figures = computeFigures(preview.fields as never)
    expect(Object.keys(figures)).toEqual(['main'])
    expect(figures.main).toBeInstanceOf(FigureOutput)
    expect(`${figures.main}`).toMatch(/^<svg /)
    expect(figures.main!.summary).toContain('Inflow')
    expect(figures.main!.tableHtml).toContain('<table class="fig-table">')
  })
  it('is empty without figures and rejects a bad figure by name', () => {
    expect(computeFigures({})).toEqual({})
    expect(() => computeFigures({ figures: { radar: { kind: 'nope', data: {} } } })).toThrow(
      /figures\.radar: Unknown figure kind/,
    )
    expect(() => computeFigures({ figures: { 'bad name': { kind: 'bar', data: {} } } })).toThrow(
      /fields.figures/,
    )
  })
  it('lets a template embed the figure next to its text with triple braces', () => {
    for (const kind of KINDS) {
      const fields = (
        kind === 'time_series' ? preview.fields : preview.variants[kind]!.fields
      ) as never
      const html = composeDocument(
        { type: 'figure', fields, variant: kind },
        { previewAssets: true },
      ).html
      expect(html, kind).toMatch(/<svg [^>]*role="img"/)
      expect(html, kind).toContain('<figcaption class="sr-only">')
      expect(html, kind).toContain('<table class="fig-table">')
    }
  })
  it('leaves the table out when asked', () => {
    const fields = { ...preview.fields, hideTable: true } as never
    const html = composeDocument({ type: 'figure', fields }, { previewAssets: true }).html
    expect(html).not.toContain('<table class="fig-table">')
  })
  it('gives the packet the figure summary as text', () => {
    const text = injectText({ type: 'figure', fields: preview.fields as never })
    expect(text).toContain('Clearwater Reservoir inflow and level')
    expect(text).toContain('Inflow goes from 12 m3/s')
  })
})

describe('registered kinds are looked up by id', () => {
  it('returns undefined for an unknown id', () => {
    expect(getFigureKind('nope')).toBeUndefined()
    expect(getFigureKind('gauge')?.kind).toBe('gauge')
  })
})
