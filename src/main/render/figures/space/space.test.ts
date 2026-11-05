// Space weather figure kinds (spec 0468 FR-5): each draws accessible SVG from the sample data of
// the space_figure template's preview variants, states levels in words, keeps the scale mappings
// of the NOAA scales, and refuses data that cannot be drawn.
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
interface Fields {
  figures: { main: Spec }
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/space_figure/preview.json'), 'utf8'),
) as { fields: Fields; variants: Record<string, { fields: Fields }> }
const sample = (k: string): Spec =>
  preview.variants[k]?.fields.figures.main ?? preview.fields.figures.main

const KINDS = [
  'space_kp_series',
  'space_xray_flux',
  'space_proton_flux',
  'space_magnetometer',
  'space_solar_wind',
  'space_gic_series',
  'space_gnss_error',
  'space_scale_panel',
  'space_impact_board',
]

it('registers the space kinds beside the generic ones', () => {
  expect(listFigureKinds()).toEqual(expect.arrayContaining(KINDS))
})

describe.each(KINDS)('%s', (kind) => {
  const spec = sample(kind)
  const r = renderFigure(spec)
  it('draws an accessible SVG, the same bytes twice, with a table and a plain summary', () => {
    expect(spec.kind).toBe(kind)
    expect(r.svg).toMatch(/^<svg [^>]*role="img"/)
    expect(r.svg).not.toMatch(/NaN|undefined|Infinity|<script/)
    expect(renderFigure(spec).svg).toBe(r.svg)
    expect(r.table!.rows.length).toBeGreaterThan(1)
    for (const row of r.table!.rows) expect(row).toHaveLength(r.table!.columns.length)
    expect(tableHtml(r.table!)).toContain('<th scope="row">')
    expect(r.summary).not.toMatch(/[<>]/)
  })
  it('labels simulated data as simulated in the drawing or the summary', () => {
    expect(r.summary).toMatch(/simulated/i)
  })
})

describe('space_kp_series', () => {
  const r = renderFigure(sample('space_kp_series'))
  it('names the peak Kp and its G level and counts the periods at G1 or above', () => {
    expect(r.summary).toContain('Peak Kp 9- at')
    expect(r.summary).toContain('G4 (Severe)')
    expect(r.summary).toMatch(/\d+ periods are at G1 or above; \d+ are predicted/)
  })
  it('puts the level words on the axis and marks predicted bars as such', () => {
    for (const w of ['G1 Minor', 'G3 Strong', 'G5 Extreme', 'predicted (dashed outline)'])
      expect(r.svg).toContain(w)
    expect(r.table!.rows.some((row) => row[3] === 'predicted')).toBe(true)
  })
  it('uses the NOAA mapping: 5 is G1, 8 is G4 and 9 is G5', () => {
    const out = renderFigure({
      kind: 'space_kp_series',
      data: {
        points: [5, 6, 7, 8, 9].map((kp, i) => ({
          time: `2026-11-05T${String(i * 3).padStart(2, '0')}:00:00Z`,
          kp,
        })),
      },
    })
    expect(out.table!.rows.map((x) => x[2])).toEqual([
      'G1 (Minor)',
      'G2 (Moderate)',
      'G3 (Strong)',
      'G4 (Severe)',
      'G5 (Extreme)',
    ])
  })
  it('refuses a Kp above 9', () => {
    expect(() =>
      renderFigure({
        kind: 'space_kp_series',
        data: { points: [{ time: '2026-11-05T00:00:00Z', kp: 10 }] },
      }),
    ).toThrow(/kp/i)
  })
})

describe('flux figures', () => {
  it('states the flare class and R level of the X-ray peak', () => {
    const r = renderFigure(sample('space_xray_flux'))
    expect(r.summary).toMatch(/Peak .*\(X2\.\d\) at .*R3 \(Strong\)/)
    for (const w of ['R1 Minor', 'R3 Strong', 'R4 Severe']) expect(r.svg).toContain(w)
    expect(r.table!.rows.at(-1)![2]).toMatch(/^[A-Z]\d\.\d \(/)
  })
  it('states the S level of the proton peak and when S1 was first reached', () => {
    const r = renderFigure(sample('space_proton_flux'))
    expect(r.summary).toMatch(/S3 \(Strong\)/)
    expect(r.summary).toMatch(/The S1 level was first reached at/)
    for (const w of ['S1 Minor', 'S5 Extreme']) expect(r.svg).toContain(w)
  })
  it('says when a level was never reached and refuses flux that is not positive', () => {
    const calm = renderFigure({
      kind: 'space_proton_flux',
      data: { points: [{ time: '2026-11-05T00:00:00Z', pfu: 0.3 }] },
    })
    expect(calm.summary).toContain('The S1 level was not reached')
    expect(() =>
      renderFigure({
        kind: 'space_xray_flux',
        data: { points: [{ time: '2026-11-05T00:00:00Z', flux: 0 }] },
      }),
    ).toThrow()
  })
})

describe('line figures', () => {
  it('numbers the events in words and reports the alarm time for the GIC series', () => {
    const r = renderFigure(sample('space_gic_series'))
    expect(r.summary).toContain('1. Operating procedure applied at Nov 06 19:12 UTC')
    expect(r.summary).toMatch(/The alarm level was first reached at Nov 06 \d\d:\d\d UTC/)
    expect(r.svg).toContain('Alarm 40 A')
  })
  it('marks the shock arrival on the solar wind series', () => {
    const r = renderFigure(sample('space_solar_wind'))
    expect(r.summary).toContain('1. Shock arrival at the monitor at Nov 06 20:41 UTC')
  })
  it('keeps the legend names for two magnetometer components', () => {
    const r = renderFigure(sample('space_magnetometer'))
    expect(r.svg).toContain('H component deviation')
    expect(r.svg).toContain('D component deviation')
  })
})

describe('space_gnss_error', () => {
  const r = renderFigure(sample('space_gnss_error'))
  it('reports the limit crossing, the fewest satellites and the lowest holdover', () => {
    expect(r.summary).toMatch(/first passes the 5 m limit at Nov 06/)
    expect(r.summary).toMatch(/The fewest satellites tracked is \d+/)
    expect(r.summary).toMatch(/Holdover remaining is lowest at [\d.]+ hours/)
    expect(r.summary).toContain('receiver class: GNSS-disciplined oscillator')
  })
  it('draws three panels and numbers the alarms', () => {
    for (const w of [
      'Horizontal error (m)',
      'Satellites tracked (satellites)',
      'Holdover remaining (h)',
      '1. First timing alarm',
      '2. Failover to fiber time source',
    ])
      expect(r.svg).toContain(w)
  })
  it('draws only the error panel when nothing else is given, and refuses a negative error', () => {
    const one = renderFigure({
      kind: 'space_gnss_error',
      data: { error: [{ time: '2026-11-05T00:00:00Z', value: 1 }] },
    })
    expect(one.svg).not.toContain('Holdover remaining')
    expect(() =>
      renderFigure({
        kind: 'space_gnss_error',
        data: { error: [{ time: '2026-11-05T00:00:00Z', value: -1 }] },
      }),
    ).toThrow(/negative/)
  })
})

describe('boards', () => {
  it('gives the scale panel a word and number for every level and a table row per scale', () => {
    const r = renderFigure(sample('space_scale_panel'))
    expect(r.summary).toContain('now below R1, S1 (Minor), G3 (Strong)')
    expect(r.summary).toContain('Nov 07 R1 (Minor), S2 (Moderate), G4 (Severe)')
    expect(r.table!.rows.map((x) => x[0])).toEqual([
      'R: Radio blackout',
      'S: Solar radiation storm',
      'G: Geomagnetic storm',
    ])
    expect(r.svg).toContain('>none<')
  })
  it('refuses a level above 5', () => {
    expect(() =>
      renderFigure({ kind: 'space_scale_panel', data: { now: { g: 6, s: 0, r: 0 } } }),
    ).toThrow()
  })
  it('gives the impact board a text state for every sector', () => {
    const r = renderFigure(sample('space_impact_board'))
    expect(r.table!.rows.map((x) => x[1])).toEqual([
      'Watch',
      'Degraded',
      'Degraded',
      'Watch',
      'Normal',
    ])
    expect(r.svg).toContain('>Degraded<')
  })
})
