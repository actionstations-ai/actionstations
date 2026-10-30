// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { SurveyListItem } from '@shared/ipc/surveys'
import { ChecklistView } from './PostExerciseChecklist'
import { checklistLines, endexDelivered } from './post-exercise'

afterEach(cleanup)

const scenario = {
  msel: [
    { id: 'I-01', purposeTag: 'NOISE' },
    { id: 'END', purposeTag: 'ENDEX' },
  ],
} as never

const state = (over: Partial<FacilitatorState> = {}) =>
  ({ delivered: {}, hotwash: [], ...over }) as unknown as FacilitatorState

const feedback = (responseCount: number): SurveyListItem =>
  ({ survey: { kind: 'participant_feedback' }, responseCount }) as unknown as SurveyListItem

describe('post-exercise checklist', () => {
  it('appears only once the ENDEX row has been delivered', () => {
    expect(endexDelivered(scenario, state())).toBe(false)
    expect(
      endexDelivered(scenario, state({ delivered: { 'I-01': { at: 'x', exerciseTime: '0:01' } } })),
    ).toBe(false)
    expect(
      endexDelivered(scenario, state({ delivered: { END: { at: 'x', exerciseTime: '4:00' } } })),
    ).toBe(true)
  })

  it('marks the hot wash done once something is recorded, and feedback once someone answered', () => {
    const none = checklistLines(state(), [feedback(0)])
    expect(none.map((l) => [l.id, l.done])).toEqual([
      ['hotwash', false],
      ['feedback', false],
      ['aar', false],
    ])
    const some = checklistLines(state({ hotwash: [{ id: 'dev-1' } as never] }), [feedback(3)])
    expect(some.map((l) => [l.id, l.done])).toEqual([
      ['hotwash', true],
      ['feedback', true],
      ['aar', false],
    ])
  })

  it('says done or to do in words and has no axe violations', async () => {
    render(<ChecklistView lines={checklistLines(state({ hotwash: [{} as never] }), [])} />)
    expect(screen.getAllByText('Done')).toHaveLength(1)
    expect(screen.getAllByText('To do')).toHaveLength(2)
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
