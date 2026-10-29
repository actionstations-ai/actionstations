import { describe, expect, it } from 'vitest'
import {
  exerciseMinOf,
  formatLocal,
  formatScenarioDate,
  formatSpan,
  nextMonday,
  parseLocal,
  scenarioAt,
  scenarioStart,
} from './scenario-time'

const today = new Date(2026, 9, 28) // Wednesday 28 October 2026 (local)

describe('scenario start', () => {
  it('uses the brief date and start time', () => {
    const s = scenarioStart({ startDate: '2026-03-12', startWallClock: '09:30' }, today)
    expect(s.source).toBe('brief')
    expect(formatLocal(s.at)).toBe('2026-03-12T09:30')
  })

  it('reads the date from the STARTEX card when the brief has none', () => {
    const s = scenarioStart(
      { startexText: 'It is Thursday, March 12, 2026, 08:00. A ramp agent reports…' },
      today,
    )
    expect(s.source).toBe('startex')
    expect(formatLocal(s.at)).toBe('2026-03-12T09:00')
  })

  it('assumes the next Monday at 09:00 otherwise', () => {
    const s = scenarioStart({ startexText: 'Morning shift change.' }, today)
    expect(s.source).toBe('assumed')
    expect(formatLocal(s.at)).toBe('2026-11-02T09:00')
  })

  it('next Monday from a Monday is a week later', () => {
    expect(nextMonday(new Date(2026, 10, 2))).toBe('2026-11-09')
    expect(nextMonday(new Date(2026, 10, 1))).toBe('2026-11-02')
  })
})

describe('scenario clock', () => {
  const start = parseLocal('2026-03-12T09:00')
  it('adds exercise minutes to STARTEX and back', () => {
    expect(formatLocal(scenarioAt(start, 100))).toBe('2026-03-12T10:40')
    expect(exerciseMinOf(start, parseLocal('2026-03-12T10:40'))).toBe(100)
  })

  it('formats deadlines and spans for the strip', () => {
    expect(formatScenarioDate(parseLocal('2026-03-13T09:12'))).toBe('Fri 13 Mar 09:12')
    expect(formatSpan(61 * 60 + 12)).toBe('61 h 12 m')
    expect(formatSpan(45.9)).toBe('45 m')
    expect(formatSpan(80 * 60)).toBe('3 d 8 h')
  })
})
