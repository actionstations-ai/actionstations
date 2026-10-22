import { describe, expect, it } from 'vitest'
import {
  parsePoints,
  resolveInjectId,
  rubricTotal,
  totalWarning,
  unknownInjectIds,
} from './rubric-rules'

const rows = [{ id: 'I-05' }, { id: 'I-05b' }, { id: 'I-09' }]

describe('rubric rules', () => {
  it('totals points and warns unless they add up to 100', () => {
    expect(rubricTotal([{ points: 30 }, { points: 30 }, { points: 40 }])).toBe(100)
    expect(totalWarning([{ points: 30 }, { points: 30 }, { points: 40 }])).toBeNull()
    expect(totalWarning([{ points: 30 }, { points: 30 }, { points: 30 }])).toBe(
      'Points add up to 90, not 100 (10 short).',
    )
    expect(totalWarning([{ points: 60 }, { points: 50 }])).toBe(
      'Points add up to 110, not 100 (10 over).',
    )
    expect(totalWarning([])).toBeNull()
  })

  it('resolves inject ids case-insensitively to the MSEL spelling', () => {
    expect(resolveInjectId(' i-05B ', rows)).toBe('I-05b')
    expect(resolveInjectId('I-99', rows)).toBeNull()
    expect(resolveInjectId('', rows)).toBeNull()
    expect(unknownInjectIds(['I-05', 'I-42', 'i-09'], rows)).toEqual(['I-42'])
  })

  it('accepts only whole, non-negative points', () => {
    expect(parsePoints('25')).toBe(25)
    expect(parsePoints(' 7 ')).toBe(7)
    expect(parsePoints('-3')).toBeNull()
    expect(parsePoints('2.5')).toBeNull()
    expect(parsePoints('')).toBeNull()
  })
})
