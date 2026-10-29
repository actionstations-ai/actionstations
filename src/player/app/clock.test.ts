import { describe, expect, it } from 'vitest'
import { elapsedMinutes, formatClock, parseExerciseTime } from './clock'

describe('exercise clock', () => {
  it('is the stored value while paused', () => {
    expect(elapsedMinutes({ elapsedMin: 12.5, rate: 1 }, 99)).toBe(12.5)
  })

  it('ticks from runningSince at the clock rate, corrected by the server offset', () => {
    const since = 1_700_000_000_000
    expect(elapsedMinutes({ elapsedMin: 10, rate: 1, runningSince: since }, since + 120_000)).toBe(
      12,
    )
    expect(elapsedMinutes({ elapsedMin: 10, rate: 2, runningSince: since }, since + 60_000)).toBe(
      12,
    )
    // The device is 30 s behind the controller: the offset puts it right.
    expect(
      elapsedMinutes({ elapsedMin: 0, rate: 1, runningSince: since }, since + 30_000, 30_000),
    ).toBe(1)
  })

  it('never runs backwards when the device clock is behind the start', () => {
    expect(elapsedMinutes({ elapsedMin: 5, rate: 1, runningSince: 1000 }, 500)).toBe(5)
  })

  it('formats and parses H:MM', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(75.9)).toBe('1:15')
    expect(formatClock(600)).toBe('10:00')
    expect(parseExerciseTime('1:15')).toBe(75)
    expect(parseExerciseTime('10:05')).toBe(605)
    expect(parseExerciseTime('x')).toBeUndefined()
    expect(parseExerciseTime(undefined)).toBeUndefined()
  })
})
