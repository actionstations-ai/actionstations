import { describe, expect, it } from 'vitest'
import { PROGRAM_FORMAT_VERSION, PlannedExercise, Program, ProgramAction } from './program'

const base = {
  id: 'prog1',
  name: 'County Program',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  appVersion: '0.5.1',
  cycle: { startYear: 2026, years: 3 },
}

describe('program schemas (#424)', () => {
  it('fills defaults and keeps keys from a newer build of the same format', () => {
    const p = Program.parse({ ...base, futureKey: { a: 1 } })
    expect(p.formatVersion).toBe(PROGRAM_FORMAT_VERSION)
    expect(p.projects).toEqual([])
    expect(p.lock).toBe(true)
    expect(p.futureKey).toEqual({ a: 1 })
  })

  it('refuses a program from a newer format with the standard message', () => {
    const r = Program.safeParse({ ...base, formatVersion: PROGRAM_FORMAT_VERSION + 1 })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toMatch(/newer version of Action Stations/)
  })

  it('limits the cycle to one to five years', () => {
    expect(Program.safeParse({ ...base, cycle: { startYear: 2026, years: 6 } }).success).toBe(false)
  })

  it('rejects path-like ids and bad dates in a corrective action', () => {
    const action = {
      id: 'ca1',
      programId: 'prog1',
      title: 'Write it',
      source: { kind: 'manual' },
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    }
    expect(ProgramAction.parse(action).status).toBe('open')
    expect(ProgramAction.safeParse({ ...action, id: '../etc' }).success).toBe(false)
    expect(ProgramAction.safeParse({ ...action, dueDate: '31/12/2026' }).success).toBe(false)
    expect(ProgramAction.safeParse({ ...action, coreCapabilities: ['made_up'] }).success).toBe(
      false,
    )
  })

  it('accepts a quarter or an exact date for a planned exercise, not both shapes mixed', () => {
    const ex = { id: 'e1', title: 'TTX', type: 'tabletop' }
    expect(PlannedExercise.safeParse({ ...ex, when: { year: 2026, quarter: 2 } }).success).toBe(
      true,
    )
    expect(PlannedExercise.safeParse({ ...ex, when: { date: '2026-05-01' } }).success).toBe(true)
    expect(PlannedExercise.safeParse({ ...ex, when: { year: 2026, quarter: 5 } }).success).toBe(
      false,
    )
  })
})
