import { describe, expect, it } from 'vitest'
import { arrayMove } from '@dnd-kit/sortable'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { draftFromScenario, type Draft } from './model'
import {
  applyDrop,
  applyRenames,
  dropTime,
  insertEndex,
  insertStartex,
  insertTimeJump,
  lineKeys,
  renumberPreview,
} from './operations'

const scenario = Scenario.parse(fixture)
const fresh = (): Draft => draftFromScenario(scenario)
const keyOf = (d: Draft, id: string) => d.rows.find((r) => r.row.id === id)!.key
const rowOf = (d: Draft, id: string) => d.rows.find((r) => r.row.id === id)!.row
const order = (d: Draft) => d.rows.map((r) => r.row.id)

/** Simulate dnd-kit: move `id` onto the line currently holding `overKey`. */
function drop(d: Draft, id: string, overKey: string, step = 5): Draft {
  const keys = lineKeys(d)
  const moved = keyOf(d, id)
  return applyDrop(d, arrayMove(keys, keys.indexOf(moved), keys.indexOf(overKey)), moved, step)
}

describe('drag to retime', () => {
  it('rounds the midpoint to the snap step without passing a neighbour', () => {
    expect(dropTime(15, 30, 5)).toBe(25) // 22.5 → 25
    expect(dropTime(15, 30, 1)).toBe(23)
    expect(dropTime(17, 18, 5)).toBe(18) // 17.5 → 20, clamped to 18
    expect(dropTime(30, 15, 5)).toBe(25)
  })

  it('dropping between two rows sets the midpoint time and re-sorts', () => {
    const d = fresh()
    // Move I-04 (0:55) up onto I-02 (0:30): it lands between I-02a (0:20) and I-02 (0:30).
    const next = drop(d, 'I-04', keyOf(d, 'I-02'))
    expect(rowOf(next, 'I-04')).toMatchObject({ time: '0:25', phaseId: 'p1', wallClock: '09:25' })
    expect(order(next).slice(0, 5)).toEqual(['START', 'I-01', 'I-02a', 'I-04', 'I-02'])
  })

  it('honours a configurable snap step', () => {
    const d = fresh()
    const next = drop(d, 'I-04', keyOf(d, 'I-02'), 1)
    expect(rowOf(next, 'I-04').time).toBe('0:25')
    const ten = drop(d, 'I-04', keyOf(d, 'I-02'), 10)
    // 25 → 30 on a 10-minute grid ties with I-02; the drop position keeps it before I-02.
    expect(rowOf(ten, 'I-04').time).toBe('0:30')
    expect(order(ten).indexOf('I-04')).toBe(order(ten).indexOf('I-02') - 1)
  })

  it('dropping into another phase adopts that phase and its window', () => {
    const d = fresh()
    // Dragged down onto I-10 (2:15) it lands after it: neighbours I-10 and I-10b (2:20).
    const next = drop(d, 'I-01', keyOf(d, 'I-10'))
    expect(rowOf(next, 'I-01')).toMatchObject({ phaseId: 'p3', time: '2:20', wallClock: '11:20' })
    expect(order(next).slice(13, 16)).toEqual(['I-10', 'I-01', 'I-10b'])
  })

  it('dropping last in a phase uses the phase end as the upper bound', () => {
    const d = fresh()
    // Onto the phase 4 header from below → lands last in phase 3, after I-12 (2:45), end 3:00.
    const next = drop(d, 'I-13', 'phase:p4')
    expect(rowOf(next, 'I-13')).toMatchObject({ phaseId: 'p3', time: '2:55' })
  })
})

describe('renumber ids', () => {
  it('leaves an already ordered MSEL alone', () => {
    expect(renumberPreview(fresh())).toEqual([])
  })

  it('attaches an orphaned b-row to the nearest preceding base row', () => {
    const d = fresh()
    const out = applyRenames(d, [{ key: keyOf(d, 'I-06'), from: 'I-06', to: 'I-20' }])
    // I-20 sits where I-06 was; I-06b has no base of its own and stays with it.
    expect(renumberPreview(out).map((r) => `${r.from}→${r.to}`)).toEqual(['I-20→I-06'])
  })

  it('carries suffixed rows with their renumbered base', () => {
    const d = fresh()
    const gap = applyRenames(d, [
      { key: keyOf(d, 'I-03'), from: 'I-03', to: 'I-30' },
      { key: keyOf(d, 'I-04'), from: 'I-04', to: 'I-40' },
      { key: keyOf(d, 'I-05'), from: 'I-05', to: 'I-50' },
      { key: keyOf(d, 'I-05b'), from: 'I-05b', to: 'I-50b' },
    ])
    const renames = renumberPreview(gap)
    expect(renames.map((r) => `${r.from}→${r.to}`)).toEqual([
      'I-30→I-03',
      'I-40→I-04',
      'I-50→I-05',
      'I-50b→I-05b',
    ])
  })
})

describe('control cards', () => {
  const empty = (): Draft => ({
    ...fresh(),
    rows: fresh().rows.filter((r) => !['START', 'END'].includes(r.row.id)),
  })

  it('puts STARTEX first in phase 1 and ENDEX after the last row', () => {
    const d = empty()
    const start = insertStartex(d, '09:00')!
    expect(start.draft.rows[0]!.row).toMatchObject({
      id: 'START',
      time: '0:00',
      purposeTag: 'STARTEX',
      wallClock: '09:00',
    })
    const end = insertEndex(start.draft)!
    expect(end.draft.rows.at(-1)!.row).toMatchObject({
      id: 'END',
      time: '3:35',
      purposeTag: 'ENDEX',
      wallClock: '12:35',
    })
  })

  it('inserts a TIME_JUMP card with the new wall clock and narration', () => {
    const d = fresh()
    const { draft, key } = insertTimeJump(d, {
      phaseId: 'p3',
      time: '2:00',
      wallClock: '11:30',
      narration: 'Crowds have doubled at the checkpoint.',
    })!
    const card = draft.rows.find((r) => r.key === key)!
    expect(card.row).toMatchObject({
      id: 'TJ-1',
      phaseId: 'p3',
      time: '2:00',
      wallClock: '11:30',
      purposeTag: 'TIME_JUMP',
      format: 'time_jump_card',
      toLabel: 'All',
      event: 'SCENARIO JUMP: It is now 11:30 AM. Crowds have doubled at the checkpoint.',
    })
    const p3 = draft.rows.filter((r) => r.row.phaseId === 'p3').map((r) => r.row.id)
    expect(p3.slice(0, 2)).toEqual(['TJ-1', 'I-09'])
  })
})
