// Early warning score arithmetic on worked examples (spec 0452 FR-5, FR-6).
import { describe, expect, it } from 'vitest'
import { EwsConfig, NEUTRAL_EWS, computeEws, scoreParameter, triggerFor } from './ews'

const param = (key: string) => NEUTRAL_EWS.parameters.find((p) => p.key === key)!

describe('scoreParameter', () => {
  it.each([
    ['respiratory_rate', 8, 3],
    ['respiratory_rate', 9, 1],
    ['respiratory_rate', 12, 0],
    ['respiratory_rate', 20, 0],
    ['respiratory_rate', 21, 2],
    ['respiratory_rate', 25, 3],
    ['oxygen_saturation', 91, 3],
    ['oxygen_saturation', 93, 2],
    ['oxygen_saturation', 95, 1],
    ['oxygen_saturation', 98, 0],
    ['systolic_bp', 90, 3],
    ['systolic_bp', 100, 2],
    ['systolic_bp', 110, 1],
    ['systolic_bp', 120, 0],
    ['systolic_bp', 220, 3],
    ['heart_rate', 40, 3],
    ['heart_rate', 45, 1],
    ['heart_rate', 70, 0],
    ['heart_rate', 100, 1],
    ['heart_rate', 120, 2],
    ['heart_rate', 140, 3],
    ['temperature', 34.8, 3],
    ['temperature', 36, 1],
    ['temperature', 37, 0],
    ['temperature', 38.5, 1],
    ['temperature', 39.5, 2],
  ])('%s of %s earns %s points', (key, value, points) => {
    expect(scoreParameter(param(key), value)?.points).toBe(points)
  })

  it('scores categories by name and leaves a missing value unscored', () => {
    expect(scoreParameter(param('consciousness'), 'alert')?.points).toBe(0)
    expect(scoreParameter(param('consciousness'), 'New confusion')?.points).toBe(3)
    expect(scoreParameter(param('heart_rate'), null)).toBeUndefined()
    expect(scoreParameter(param('heart_rate'), 'fast')).toBeUndefined()
  })
})

describe('computeEws', () => {
  const stable = {
    respiratory_rate: 16,
    oxygen_saturation: 97,
    systolic_bp: 124,
    heart_rate: 78,
    temperature: 37.0,
    consciousness: 'Alert',
  }

  it('totals zero and stays routine for a stable reading', () => {
    const r = computeEws(NEUTRAL_EWS, stable)
    expect(r.total).toBe(0)
    expect(r.trigger.level).toBe('Routine')
    expect(r.missing).toEqual([])
  })

  it('adds the parameters of a deteriorating reading and reaches the high level', () => {
    const r = computeEws(NEUTRAL_EWS, {
      respiratory_rate: 26,
      oxygen_saturation: 91,
      systolic_bp: 82,
      heart_rate: 126,
      temperature: 38.9,
      consciousness: 'New confusion',
    })
    expect(r.lines.map((l) => l.points)).toEqual([3, 3, 3, 2, 1, 3])
    expect(r.total).toBe(15)
    expect(r.trigger.level).toBe('High')
    expect(r.trigger.response).toMatch(/rapid response/i)
  })

  it.each([
    [0, 'Routine'],
    [2, 'Routine'],
    [3, 'Low'],
    [4, 'Low'],
    [5, 'Medium'],
    [6, 'Medium'],
    [7, 'High'],
    [12, 'High'],
  ])('a total of %s is %s', (total, level) => {
    expect(triggerFor(NEUTRAL_EWS, total).level).toBe(level)
  })

  it('raises the level when one parameter is at the single-parameter maximum', () => {
    const r = computeEws(NEUTRAL_EWS, { ...stable, systolic_bp: 85 })
    expect(r.total).toBe(3)
    expect(r.singleParameter).toBe(true)
    expect(r.trigger.level).toBe('Low')
    const flat = computeEws(
      { ...NEUTRAL_EWS, singleParameterMax: undefined },
      { ...stable, systolic_bp: 85 },
    )
    expect(flat.singleParameter).toBe(false)
  })

  it('names the parameters that were not recorded and scores nothing for them', () => {
    const r = computeEws(NEUTRAL_EWS, { respiratory_rate: 22 })
    expect(r.total).toBe(2)
    expect(r.missing).toContain('Heart rate')
  })
})

describe('EwsConfig', () => {
  it('needs a source so a chart always cites one', () => {
    expect(EwsConfig.safeParse({ ...NEUTRAL_EWS, source: '' }).success).toBe(false)
    expect(EwsConfig.safeParse(NEUTRAL_EWS).success).toBe(true)
  })

  it('says in its name and source that the bundled score is not a published one', () => {
    expect(NEUTRAL_EWS.name).toMatch(/neutral/i)
    expect(NEUTRAL_EWS.source).toMatch(/not a published/i)
  })
})
