// Exercise time <-> case time (spec 0448 FR-9), including time jumps.
import { describe, expect, it } from 'vitest'
import { CaseTimeMapping } from './schemas/case-data'
import {
  caseTimeIso,
  caseTimeMs,
  exerciseMinFromCase,
  formatCaseTime,
  offsetToCaseMs,
} from './case-time'

const map = (extra: Record<string, unknown> = {}) =>
  CaseTimeMapping.parse({ caseStart: '2024-09-26T12:00:00Z', ...extra })

describe('exercise time to case time', () => {
  it('starts at the case start plus the offset', () => {
    expect(caseTimeIso(0, map())).toBe('2024-09-26T12:00:00.000Z')
    expect(caseTimeIso(0, map({ startOffsetMin: 90 }))).toBe('2024-09-26T13:30:00.000Z')
  })

  it('runs at real time by default: 1:15 into the exercise is 75 case minutes', () => {
    expect(caseTimeIso(75, map())).toBe('2024-09-26T13:15:00.000Z')
  })

  it('applies the speed factor', () => {
    expect(caseTimeIso(30, map({ speed: 4 }))).toBe('2024-09-26T14:00:00.000Z')
  })

  it('adds a jump once the exercise clock reaches it, not before', () => {
    const m = map({ jumps: [{ atMin: 60, skipMin: 360 }] })
    expect(caseTimeIso(59, m)).toBe('2024-09-26T12:59:00.000Z')
    expect(caseTimeIso(60, m)).toBe('2024-09-26T19:00:00.000Z')
    expect(caseTimeIso(75, m)).toBe('2024-09-26T19:15:00.000Z')
  })

  it('adds several jumps, whatever order they are listed in', () => {
    const m = map({
      jumps: [
        { atMin: 120, skipMin: 60 },
        { atMin: 60, skipMin: 360 },
      ],
    })
    expect(caseTimeMs(130, m) - caseTimeMs(0, m)).toBe((130 + 360 + 60) * 60_000)
  })

  it('combines speed, offset and jumps', () => {
    const m = map({ speed: 2, startOffsetMin: 10, jumps: [{ atMin: 30, skipMin: 100 }] })
    // 10 + 40 * 2 + 100 = 190 minutes after 12:00
    expect(caseTimeIso(40, m)).toBe('2024-09-26T15:10:00.000Z')
  })
})

describe('case time to exercise time', () => {
  it('inverts the mapping without jumps', () => {
    const m = map({ speed: 4, startOffsetMin: 20 })
    for (const ex of [0, 7.5, 30, 200])
      expect(exerciseMinFromCase(caseTimeMs(ex, m), m)).toBeCloseTo(ex, 9)
  })

  it('inverts the mapping across jumps', () => {
    const m = map({
      speed: 2,
      jumps: [
        { atMin: 30, skipMin: 100 },
        { atMin: 50, skipMin: 40 },
      ],
    })
    for (const ex of [0, 10, 30, 45, 50, 80])
      expect(exerciseMinFromCase(caseTimeMs(ex, m), m)).toBeCloseTo(ex, 9)
  })

  it('maps a case time inside a skipped span to the minute of the jump', () => {
    const m = map({ jumps: [{ atMin: 60, skipMin: 360 }] })
    expect(exerciseMinFromCase(Date.parse('2024-09-26T15:00:00Z'), m)).toBe(60)
  })

  it('gives a negative minute for a case time before the start', () => {
    expect(exerciseMinFromCase(Date.parse('2024-09-26T11:00:00Z'), map())).toBe(-60)
  })
})

describe('helpers', () => {
  it('counts an offset from the dataset start', () => {
    expect(offsetToCaseMs('2024-09-26T12:00:00Z', 90)).toBe(Date.parse('2024-09-26T13:30:00Z'))
  })
  it('formats a case time in UTC', () => {
    expect(formatCaseTime(Date.parse('2024-09-26T14:05:30Z'))).toBe('2024-09-26 14:05 UTC')
  })
})
