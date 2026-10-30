import { describe, expect, it } from 'vitest'
import type { EegOutput } from '@shared/schemas'
import { focusCapabilities, missingGuides } from './eeg-focus'

const maps = (...rows: string[][]): EegOutput['objectiveCapabilities'] =>
  rows.map((caps, i) => ({
    objective: `Objective ${i + 1}`,
    capabilities: caps.map((capability) => ({ capability, why: '' }) as never),
  }))
const output = (rows: string[][], guides: string[]): EegOutput => ({
  objectiveCapabilities: maps(...rows),
  eegs: guides.map((capability) => ({ capability, target: '', criticalTasks: [] }) as never),
})
const names = (o: EegOutput['objectiveCapabilities']) =>
  o.map((x) => x.capabilities.map((c) => c.capability))

describe('focusCapabilities', () => {
  it('keeps the capabilities most objectives share and every objective keeps one', () => {
    const out = output(
      [
        ['planning', 'a1'],
        ['planning', 'b1'],
        ['planning', 'c1'],
        ['planning', 'd1'],
      ],
      [],
    )
    const kept = names(focusCapabilities(out, 2))
    expect(kept.every((c) => c.length >= 1)).toBe(true)
    expect(new Set(kept.flat()).size).toBeLessThanOrEqual(3)
    expect(kept.every((c) => c.includes('planning'))).toBe(true)
  })

  it('gives an objective whose capabilities were all cut its first one back', () => {
    const out = output([['planning'], ['planning'], ['x'], ['y']], [])
    const kept = names(focusCapabilities(out, 1))
    expect(kept).toEqual([['planning'], ['planning'], ['x'], ['y']])
  })
})

describe('missingGuides', () => {
  it('lists mapped capabilities with no guide, once each', () => {
    const out = output(
      [
        ['planning', 'logistics'],
        ['planning', 'cyber'],
      ],
      ['planning'],
    )
    expect(missingGuides(out)).toEqual(['logistics', 'cyber'])
  })

  it('is empty when every mapped capability has a guide', () => {
    expect(missingGuides(output([['planning']], ['planning']))).toEqual([])
  })
})
