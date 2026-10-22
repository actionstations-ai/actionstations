import { describe, expect, it } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { citationShort, applyTo, describeSnapshot, toDisplay, wallClockAt } from './cell-format'
import { commitCell, tabTarget } from './cell-commit'
import { navigate, type Line } from './grid-nav'
import {
  addRowAfter,
  draftFromScenario,
  duplicateRow,
  insertedId,
  keyRange,
  moveToPhase,
  parseExerciseTime,
  phaseWindowWarning,
  shiftTimes,
  type Draft,
} from './model'
import { lineKeys } from './operations'

const scenario = Scenario.parse(fixture)
const fresh = (): Draft => draftFromScenario(scenario)
const keyOf = (d: Draft, id: string) => d.rows.find((r) => r.row.id === id)!.key
const rowOf = (d: Draft, id: string) => d.rows.find((r) => r.row.id === id)!.row
const ids = (d: Draft, phaseId: string) =>
  d.rows.filter((r) => r.row.phaseId === phaseId).map((r) => `${r.row.id}@${r.row.time}`)

describe('time parsing and phase windows', () => {
  it('accepts H:MM and bare minutes, rejects the rest', () => {
    expect(parseExerciseTime('1:15')).toBe(75)
    expect(parseExerciseTime('0:05')).toBe(5)
    expect(parseExerciseTime('95')).toBe(95)
    expect(parseExerciseTime('1:75')).toBeNull()
    expect(parseExerciseTime('noon')).toBeNull()
  })

  it('warns (inclusive window, like lint) when a row leaves its phase', () => {
    const row = rowOf(fresh(), 'I-03')
    expect(phaseWindowWarning(row, scenario.phases)).toBeNull()
    expect(phaseWindowWarning({ ...row, time: '1:00' }, scenario.phases)).toBeNull()
    expect(phaseWindowWarning({ ...row, time: '1:05' }, scenario.phases)).toBe(
      '1:05 is outside Phase 1 (0:00–1:00)',
    )
  })
})

describe('cell commits', () => {
  it('retimes a row, moves its wall clock along and re-sorts the phase', () => {
    const d = fresh()
    const next = commitCell(d, { line: keyOf(d, 'I-01'), col: 'time' }, '0:50')
    expect(rowOf(next, 'I-01')).toMatchObject({ time: '0:50', wallClock: '09:50' })
    expect(ids(next, 'p1')).toEqual([
      'START@0:00',
      'I-02a@0:20',
      'I-02@0:30',
      'I-03@0:45',
      'I-01@0:50',
      'I-04@0:55',
    ])
  })

  it('ignores an invalid time and returns the same draft for no-op edits', () => {
    const d = fresh()
    expect(commitCell(d, { line: keyOf(d, 'I-01'), col: 'time' }, '9:99')).toBe(d)
    expect(commitCell(d, { line: keyOf(d, 'I-01'), col: 'from' }, 'Airline Rep')).toBe(d)
  })

  it('sets To to All or to roles (label then derives from roles)', () => {
    const row = rowOf(fresh(), 'I-01')
    const all = applyTo(row, ['__all__'])
    expect(all).toMatchObject({ toRoleIds: [], toLabel: 'All' })
    const roles = applyTo(row, ['pio', 'asc'])
    expect(roles.toLabel).toBeUndefined()
    expect(toDisplay(roles, scenario.roles)).toBe('PIO, ASC')
  })

  it('edits tag, format (empty clears it), citations and the phase goal', () => {
    const d = fresh()
    const start = keyOf(d, 'START')
    let next = commitCell(d, { line: start, col: 'tag' }, ['DECISION_POINT'])
    next = commitCell(next, { line: start, col: 'format' }, [''])
    next = commitCell(next, { line: start, col: 'citations' }, [])
    expect(rowOf(next, 'START')).toMatchObject({ purposeTag: 'DECISION_POINT', citations: [] })
    expect(rowOf(next, 'START').format).toBeUndefined()
    const goal = commitCell(d, { line: 'phase:p2', col: 'event' }, 'New goal')
    expect(goal.phases[1]!.goal).toBe('New goal')
  })

  it('Tab walks editable cells and wraps to the next row', () => {
    const d = fresh()
    const lines: Line[] = lineKeys(d).map((key) => ({
      key,
      kind: key.startsWith('phase:') ? 'phase' : 'row',
    }))
    const k = keyOf(d, 'I-01')
    expect(tabTarget(lines, { line: k, col: 'time' }, 'next')).toEqual({ line: k, col: 'id' })
    expect(tabTarget(lines, { line: k, col: 'citations' }, 'next')).toEqual({
      line: keyOf(d, 'I-02a'),
      col: 'time',
    })
    expect(tabTarget(lines, { line: k, col: 'time' }, 'prev')).toEqual({
      line: keyOf(d, 'START'),
      col: 'citations',
    })
  })
})

describe('grid navigation', () => {
  it('moves with arrows across phase header lines', () => {
    const d = fresh()
    const lines: Line[] = lineKeys(d).map((key) => ({
      key,
      kind: key.startsWith('phase:') ? 'phase' : 'row',
    }))
    const i04 = { line: keyOf(d, 'I-04'), col: 'event' as const }
    expect(navigate(lines, i04, 'ArrowDown', false)).toEqual({ line: 'phase:p2', col: 'event' })
    expect(navigate(lines, i04, 'ArrowRight', false)).toEqual({ ...i04, col: 'expected' })
    expect(navigate(lines, i04, 'Home', false)).toEqual({ ...i04, col: 'select' })
    expect(navigate(lines, i04, 'Home', true)).toEqual({ line: 'phase:p1', col: 'select' })
    expect(navigate(lines, i04, 'x', false)).toBeNull()
  })
})

describe('row operations', () => {
  it('adds a CORE_NARRATIVE row 5 minutes after the anchor with a b-suffix id', () => {
    const d = fresh()
    const { draft, key } = addRowAfter(d, keyOf(d, 'I-03'))
    const row = draft.rows.find((r) => r.key === key)!.row
    expect(row).toMatchObject({
      id: 'I-03b',
      phaseId: 'p1',
      time: '0:50',
      wallClock: '09:50',
      purposeTag: 'CORE_NARRATIVE',
    })
    expect(ids(draft, 'p1').slice(-3)).toEqual(['I-03@0:45', 'I-03b@0:50', 'I-04@0:55'])
  })

  it('picks the next free suffix or number', () => {
    const taken = new Set(['I-05', 'I-05b', 'START', 'I-12'])
    expect(insertedId({ ...rowOf(fresh(), 'I-05'), id: 'I-05' }, taken)).toBe('I-05c')
    expect(insertedId({ ...rowOf(fresh(), 'START') }, taken)).toBe('I-13')
  })

  it('duplicates without the inject link and unlocked', () => {
    const d = fresh()
    const src = keyOf(d, 'I-06')
    const linked = {
      ...d,
      rows: d.rows.map((r) =>
        r.key === src ? { ...r, row: { ...r.row, injectId: 'inj1', locked: true } } : r,
      ),
    }
    const { draft, key } = duplicateRow(linked, src)!
    const copy = draft.rows.find((r) => r.key === key)!.row
    expect(copy).toMatchObject({ id: 'I-06c', time: '1:15', locked: false })
    expect(copy.injectId).toBeUndefined()
  })

  it('shifts selected rows by N minutes (never below 0:00) and moves wall clocks', () => {
    const d = fresh()
    const p3 = new Set(d.rows.filter((r) => r.row.phaseId === 'p3').map((r) => r.key))
    const shifted = shiftTimes(d, p3, 10)
    expect(ids(shifted, 'p3')).toEqual([
      'I-09@2:10',
      'I-10@2:25',
      'I-10b@2:30',
      'I-11@2:40',
      'I-12@2:55',
    ])
    expect(rowOf(shifted, 'I-12').wallClock).toBe('11:55')
    const back = shiftTimes(d, new Set([keyOf(d, 'START')]), -15)
    expect(rowOf(back, 'START').time).toBe('0:00')
  })

  it('moves rows to another phase and keeps them time-sorted there', () => {
    const d = fresh()
    const moved = moveToPhase(d, new Set([keyOf(d, 'I-04')]), 'p2')
    expect(ids(moved, 'p2')[0]).toBe('I-04@0:55')
  })

  it('selects a key range in display order', () => {
    const d = fresh()
    expect(keyRange(d, keyOf(d, 'I-03'), keyOf(d, 'I-01')).length).toBe(4)
  })
})

describe('cell formatting', () => {
  it('shortens citations to document + section number', () => {
    expect(citationShort(rowOf(fresh(), 'START').citations[0]!)).toBe('TIRP 13.6')
    expect(
      citationShort({
        documentId: 'asp',
        documentTitle: 'Airport Security Program',
        headingPath: 'ASP › §6.4 Access control',
      }),
    ).toBe('ASP 6.4')
  })

  it('infers wall clock from rows that have one', () => {
    expect(wallClockAt(scenario.msel, 150)).toBe('11:30')
    expect(wallClockAt([], 150)).toBe('')
  })
})

describe('history preview', () => {
  it('summarises how a snapshot differs from the current MSEL', () => {
    const now = scenario.msel
    expect(describeSnapshot(now, now)).toBe('24 rows; same as now.')
    const snap = [...now.slice(0, -1), { ...now[1]!, id: 'I-99' }].map((r) =>
      r.id === 'I-02' ? { ...r, from: 'SOC' } : r,
    )
    expect(describeSnapshot(snap, now)).toBe(
      '24 rows; brings back I-99; drops END; 1 row differ (I-02).',
    )
  })
})
