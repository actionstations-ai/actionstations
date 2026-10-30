import { describe, expect, it } from 'vitest'
import type { Opened } from '../../../shared/live/codec'
import {
  allChecked,
  applyClose,
  applyFeedback,
  applyOpen,
  currentDrill,
  firstOpenStep,
  markPending,
  mayJoin,
  stepState,
  type PlayerDrill,
} from './drills'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'

const open = (over: Record<string, unknown> = {}) =>
  ({
    payload: {
      drillId: ID,
      title: 'Notify the duty manager',
      situation: 'A drone is near the runway.',
      durationMin: 15,
      assessment: 'model',
      steps: [
        { id: 's1', prompt: 'Who first?' },
        { id: 's2', prompt: 'What next?' },
      ],
      targets: ['all'],
      ...over,
    },
  }) as unknown as Opened<'drill.open'>

const feedback = (payload: Record<string, unknown>) =>
  ({ payload: { drillId: ID, stepId: 's1', ...payload } }) as unknown as Opened<'drill.feedback'>

const player = { clientId: 'playerA-00000000000000' as never, kind: 'player' as const }
const drill = (over: Partial<PlayerDrill> = {}): PlayerDrill => ({
  ...applyOpen({}, open(), 10).drills[ID]!,
  ...over,
})

describe('drills on a device', () => {
  it('records a drill and keeps this device’s progress when it is announced again', () => {
    const first = applyOpen({}, open(), 10)
    expect(first.isNew).toBe(true)
    const worked = applyFeedback(first.drills, feedback({ kind: 'result', left: 0 }))
    const again = applyOpen(worked, open({ title: 'Renamed' }), 99)
    expect(again.isNew).toBe(false)
    expect(again.drills[ID]).toMatchObject({ title: 'Renamed', openedAt: 10 })
    expect(stepState(again.drills[ID]!, 's1').checked).toBe(true)
  })

  it('closes a known drill and ignores an unknown one', () => {
    const { drills } = applyOpen({}, open(), 10)
    const close = { payload: { drillId: ID } } as unknown as Opened<'drill.close'>
    expect(applyClose(drills, close)[ID]!.status).toBe('closed')
    const other = { payload: { drillId: 'B'.repeat(22) } } as unknown as Opened<'drill.close'>
    expect(applyClose(drills, other)).toBe(drills)
  })

  it('shows a drill to players in scope only', () => {
    expect(mayJoin(drill(), player)).toBe(true)
    expect(mayJoin(drill(), { ...player, kind: 'evaluator' })).toBe(false)
    expect(mayJoin(drill({ targets: ['role:ops'] }), { ...player, roleId: 'ops' })).toBe(true)
    expect(mayJoin(drill({ targets: ['role:ops'] }), { ...player, roleId: 'fire' })).toBe(false)
    expect(mayJoin(drill(), undefined)).toBe(false)
  })

  it('tracks a question from waiting, to a result, to a hint', () => {
    let drills = applyOpen({}, open(), 10).drills
    drills = markPending(drills, ID, 's1')
    expect(stepState(drills[ID]!, 's1').pending).toBe(true)
    drills = applyFeedback(
      drills,
      feedback({ kind: 'result', covered: ['A'], left: 1, hintOffer: 1 }),
    )
    expect(stepState(drills[ID]!, 's1')).toMatchObject({ pending: false, checked: true })
    drills = applyFeedback(drills, feedback({ kind: 'hint', hint: { level: 1, text: 'Think.' } }))
    drills = applyFeedback(drills, feedback({ kind: 'hint', hint: { level: 1, text: 'Think.' } }))
    expect(stepState(drills[ID]!, 's1').hints).toHaveLength(1)
    expect(stepState(drills[ID]!, 's1').reply).toMatchObject({ kind: 'result' })
  })

  it('does not count an error or a checklist request as a checked answer', () => {
    let drills = applyOpen({}, open(), 10).drills
    drills = applyFeedback(drills, feedback({ kind: 'error', message: 'Write an answer first.' }))
    drills = applyFeedback(drills, feedback({ kind: 'checklist', points: [] }))
    expect(stepState(drills[ID]!, 's1').checked).toBe(false)
  })

  it('ignores replies for unknown drills and questions', () => {
    const { drills } = applyOpen({}, open(), 10)
    expect(applyFeedback(drills, feedback({ kind: 'result', stepId: 'nope' }))[ID]).toEqual(
      drills[ID],
    )
    const stray = { payload: { drillId: 'B'.repeat(22), stepId: 's1', kind: 'result' } }
    expect(applyFeedback(drills, stray as unknown as Opened<'drill.feedback'>)).toBe(drills)
  })

  it('finds the open drill for the banner and the first unchecked question', () => {
    const d = drill()
    expect(currentDrill({ [ID]: d }, player)?.drillId).toBe(ID)
    expect(currentDrill({ [ID]: { ...d, status: 'closed' } }, player)).toBeUndefined()
    expect(firstOpenStep(d)).toBe(0)
    const done = applyFeedback({ [ID]: d }, feedback({ kind: 'result' }))[ID]!
    expect(firstOpenStep(done)).toBe(1)
    expect(allChecked(done)).toBe(false)
    const all = applyFeedback({ [ID]: done }, feedback({ kind: 'result', stepId: 's2' }))[ID]!
    expect(allChecked(all)).toBe(true)
    expect(firstOpenStep(all)).toBe(1)
  })
})
