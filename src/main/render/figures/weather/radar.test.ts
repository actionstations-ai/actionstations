// The radar figure on the recorded fixture: three products, a text summary that carries the
// values, a data table, labels for historical or simulated data, and deterministic output.
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { sampleRadarData } from '../../../toolkits/weather/nexrad/sample'
import { decodeVolume } from '../../../toolkits/weather/nexrad/level2'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { renderFigure, computeFigures, listFigureKinds } = await import('../index')
void decodeVolume

describe('radar figure', () => {
  it('is registered', () => {
    expect(listFigureKinds()).toContain('radar')
  })

  it('draws reflectivity with a summary of the peak and the area of strong echoes', () => {
    const r = renderFigure({ kind: 'radar', data: sampleRadarData('reflectivity') })
    expect(r.svg.startsWith('<svg')).toBe(true)
    expect(r.svg).toContain('data:image/png;base64,')
    expect(r.summary).toMatch(
      /Reflectivity from radar KILN \(Wilmington OH\) at the 0\.5 degree tilt, 20:03Z 7 May 2024, historical data/,
    )
    expect(r.summary).toMatch(
      /Peak reflectivity is 59 dBZ at \d{3} degrees at \d+ km \(\d+\.\d+N \d+\.\d+W\)/,
    )
    expect(r.summary).toMatch(/Echoes of 50 dBZ or more cover about \d+ km2/)
    expect(r.summary).toMatch(/Exercise warning: peak \d+ dBZ inside|Exercise warning: no echoes/)
    expect(r.summary).toMatch(/Storm motion from 250 degrees at 32 kt/)
    expect(r.table!.rows.map((x) => x[0])).toEqual(
      expect.arrayContaining(['Peak reflectivity', 'Area of 50 dBZ or more', 'Exercise warning']),
    )
  })

  it('draws velocity in knots with the strongest inbound and outbound values', () => {
    const r = renderFigure({ kind: 'radar', data: sampleRadarData('velocity') })
    expect(r.summary).toMatch(/Radial velocity from radar KILN/)
    expect(r.summary).toMatch(
      /Strongest inbound velocity is \d+ kt at \d{3} degrees at \d+ km; strongest outbound is \d+ kt/,
    )
    expect(r.summary).toMatch(/Velocity changes by \d+ kt|No velocity change of 40 kt/)
    expect(r.svg).toContain('Radial velocity (kt)')
  })

  it('draws correlation coefficient with the lowest value', () => {
    const r = renderFigure({ kind: 'radar', data: sampleRadarData('correlation_coefficient') })
    expect(r.summary).toMatch(/The lowest correlation coefficient is 0\.\d\d at/)
    expect(r.svg).toContain('Correlation coefficient')
  })

  it('labels the data as historical or simulated on the figure', () => {
    const data = sampleRadarData('reflectivity')
    expect(renderFigure({ kind: 'radar', data }).svg).toContain('Historical data')
    const sim = renderFigure({ kind: 'radar', data: { ...data, origin: 'simulated' } })
    expect(sim.svg).toContain('Simulated data')
    expect(sim.summary).toContain('simulated data')
  })

  it('lists the legend ranges so color is not the only cue', () => {
    const svg = renderFigure({ kind: 'radar', data: sampleRadarData('reflectivity') }).svg
    for (const label of ['5 to 10', '50 to 55', '75 and above']) expect(svg).toContain(label)
  })

  it('renders the same bytes twice', () => {
    const a = renderFigure({ kind: 'radar', data: sampleRadarData('velocity') }).svg
    const b = renderFigure({ kind: 'radar', data: sampleRadarData('velocity') }).svg
    expect(a).toBe(b)
  })

  it('refuses data whose codes do not match the radials and gates', () => {
    const data = sampleRadarData('reflectivity')
    expect(() =>
      renderFigure({
        kind: 'radar',
        data: { ...data, field: { ...data.field, gates: data.field.gates + 1 } },
      }),
    ).toThrow(/expected \d+ codes/)
    expect(() => renderFigure({ kind: 'radar', data: { ...data, origin: 'real' } })).toThrow(
      /origin/,
    )
  })

  it('works through computeFigures for a template', () => {
    const figures = computeFigures({
      figures: { main: { kind: 'radar', data: sampleRadarData('reflectivity') } },
    })
    expect(figures.main!.summary).toContain('KILN')
    expect(figures.main!.tableHtml).toContain('<table')
  })
})
