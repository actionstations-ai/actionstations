import { describe, expect, it } from 'vitest'
import type { FacilitatorState } from '@shared/ipc'
import type { MselRow } from '@shared/schemas/scenario'
import {
  clockMinutes,
  dueRows,
  exerciseStamp,
  formatClock,
  isRunning,
  nextRow,
  nextTimeJump,
  parseClockInput,
  pauseClock,
  resetClock,
  scenarioWallClock,
  setClock,
  startClock,
  toggleClock,
} from './clock'

const at = (iso: string) => new Date(iso)
const T0 = at('2026-10-21T14:00:00.000Z')
const plus = (min: number) => new Date(T0.getTime() + min * 60_000)
const base: FacilitatorState = { elapsedMin: 0, delivered: {}, notes: {}, generalNotes: '' }

const row = (id: string, time: string, purposeTag = 'CORE_NARRATIVE'): MselRow =>
  ({
    id,
    time,
    phaseId: 'p1',
    from: 'SimCell',
    event: id,
    expectedAction: '',
    purposeTag,
  }) as MselRow

describe('exercise clock', () => {
  it('runs from its start instant and pauses at the elapsed time', () => {
    const running = startClock(base, T0)
    expect(isRunning(running)).toBe(true)
    expect(clockMinutes(running, plus(12.5))).toBe(12.5)
    const paused = pauseClock(running, plus(12.5))
    expect(isRunning(paused)).toBe(false)
    expect(paused.runningSince).toBeUndefined()
    expect(clockMinutes(paused, plus(60))).toBe(12.5)
  })

  it('resumes from the paused time', () => {
    const paused = pauseClock(startClock(base, T0), plus(10))
    const resumed = startClock(paused, plus(30))
    expect(clockMinutes(resumed, plus(35))).toBe(15)
    expect(toggleClock(resumed, plus(40)).elapsedMin).toBe(20)
  })

  it('start and pause are idempotent', () => {
    const running = startClock(base, T0)
    expect(startClock(running, plus(5))).toBe(running)
    expect(pauseClock(base, plus(5))).toBe(base)
  })

  it('sets the time while paused or running, and resets', () => {
    expect(setClock(base, 75, T0)).toMatchObject({ elapsedMin: 75 })
    expect(setClock(base, 75, T0).runningSince).toBeUndefined()
    const running = setClock(startClock(base, T0), 60, plus(3))
    expect(clockMinutes(running, plus(8))).toBe(65)
    expect(setClock(base, -5, T0).elapsedMin).toBe(0)
    const reset = resetClock(running)
    expect(reset).toMatchObject({ elapsedMin: 0 })
    expect(reset.runningSince).toBeUndefined()
  })

  it('ignores a corrupt start instant instead of showing NaN', () => {
    expect(clockMinutes({ elapsedMin: 7, runningSince: 'garbage' }, T0)).toBe(7)
  })

  it('formats and parses clock text', () => {
    expect(formatClock(0)).toBe('0:00:00')
    expect(formatClock(75.5)).toBe('1:15:30')
    expect(exerciseStamp(75.9)).toBe('1:15')
    expect(parseClockInput('1:15')).toBe(75)
    expect(parseClockInput('0:10:30')).toBe(10.5)
    expect(parseClockInput('45')).toBe(45)
    expect(parseClockInput('1:75')).toBeUndefined()
    expect(parseClockInput('soon')).toBeUndefined()
  })

  it('derives the narrative wall clock from the scenario start time', () => {
    expect(scenarioWallClock('09:00', 75.4)).toBe('10:15')
    expect(scenarioWallClock('23:30', 45)).toBe('00:15')
    expect(scenarioWallClock(undefined, 10)).toBeUndefined()
  })
})

describe('timeline', () => {
  const msel = [
    row('START', '0:00', 'STARTEX'),
    row('I-01', '0:15'),
    row('I-02', '0:30'),
    row('I-05', '1:00', 'TIME_JUMP'),
    row('I-06', '1:15'),
    row('I-09', '2:00', 'TIME_JUMP'),
  ]

  it('marks rows due once the clock reaches them, until delivered', () => {
    expect(dueRows(msel, 20, {}).map((r) => r.id)).toEqual(['START', 'I-01'])
    const delivered = { START: { at: T0.toISOString(), exerciseTime: '0:00' } }
    expect(dueRows(msel, 30, delivered).map((r) => r.id)).toEqual(['I-01', 'I-02'])
    expect(dueRows(msel, 14.9, delivered)).toEqual([])
  })

  it('picks the earliest undelivered row as next', () => {
    const delivered = {
      START: { at: '', exerciseTime: '0:00' },
      'I-02': { at: '', exerciseTime: '0:31' },
    }
    expect(nextRow(msel, delivered)?.id).toBe('I-01')
    const all = Object.fromEntries(msel.map((r) => [r.id, { at: '', exerciseTime: '' }]))
    expect(nextRow(msel, all)).toBeUndefined()
  })

  it('finds the next time jump after the clock', () => {
    expect(nextTimeJump(msel, 10)?.id).toBe('I-05')
    expect(nextTimeJump(msel, 60.5)?.id).toBe('I-09')
    expect(nextTimeJump(msel, 120)).toBeUndefined()
  })
})
