// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { branchedScenario } from '@shared/branching/fixture'
import { FacilitatorState } from '@shared/ipc/facilitator'
import type { Phase } from '@shared/schemas/scenario'
import { availability, pathFor, buildRecord, withRecord } from './branching'
import { Timeline, type TimelineEntry } from './Timeline'

afterEach(() => cleanup())

const phase: Phase = {
  id: 'p1',
  index: 0,
  title: 'One',
  goal: '',
  startTime: '0:00',
  endTime: '4:00',
}

function entriesFor(state: FacilitatorState): TimelineEntry[] {
  const s = branchedScenario()
  const path = pathFor(s, state)
  return s.msel.map((row) => {
    const lane = s.branches.find((b) => b.id === row.branchId)
    return {
      row,
      inject: undefined,
      target: 'All',
      thumbUrl: undefined,
      hasAudio: false,
      due: false,
      deliveredAt: undefined,
      hasNote: false,
      availability: availability(path, row.id),
      ...(lane ? { lane: { chip: lane.id.toUpperCase(), label: lane.label } } : {}),
      ...(path?.openDecision && row.decision?.id === path.openDecision.id
        ? { decisionOpen: true }
        : {}),
    }
  })
}

function show(state: FacilitatorState) {
  const onDeliver = vi.fn()
  render(
    <Timeline
      phases={[phase]}
      entries={entriesFor(state)}
      selectedId={undefined}
      onSelect={vi.fn()}
      onDeliver={onDeliver}
      onUndo={vi.fn()}
    />,
  )
  return onDeliver
}

const decided = (optionId: string) =>
  withRecord(
    FacilitatorState.parse({}),
    buildRecord({
      decision: branchedScenario().msel[1]!.decision!,
      by: 'controller',
      choice: optionId,
      input: { decisionId: 'd1', tally: {} },
      now: new Date('2026-03-01T10:00:00Z'),
      exerciseTime: '1:30',
    }),
    'seed',
  )

describe('Timeline with branches', () => {
  it('holds back everything after an open decision', () => {
    show(FacilitatorState.parse({}))
    expect(screen.getByText('Decision open')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deliver I-16' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Deliver I-10' })).toHaveProperty('disabled', false)
  })

  it('dims the branch not taken, says so, and refuses delivery', async () => {
    const onDeliver = show(decided('pay'))
    const row = screen.getByRole('button', { name: 'Deliver I-11b' })
    expect(row).toHaveProperty('disabled', true)
    await userEvent.click(row)
    expect(onDeliver).not.toHaveBeenCalled()
    expect(screen.getAllByText('Not taken').length).toBeGreaterThan(0)
  })

  it('delivers rows of the branch that was chosen and labels the lane in text', async () => {
    const onDeliver = show(decided('pay'))
    expect(screen.getAllByText('Branch B1: Pay').length).toBe(2)
    await userEvent.click(screen.getByRole('button', { name: 'Deliver I-11a' }))
    expect(onDeliver).toHaveBeenCalledWith('I-11a')
  })

  it('switches to the other branch when the decision is overridden', () => {
    const state = withRecord(
      decided('pay'),
      buildRecord({
        decision: branchedScenario().msel[1]!.decision!,
        by: 'override',
        choice: 'rebuild',
        note: 'Room asked',
        supersedes: 'd1',
        input: { decisionId: 'd1', tally: {} },
        now: new Date('2026-03-01T10:05:00Z'),
        exerciseTime: '1:35',
      }),
      'seed',
    )
    show(state)
    const list = screen.getByRole('region', { name: 'Timeline' })
    expect(within(list).getByRole('button', { name: 'Deliver I-11b' })).toHaveProperty(
      'disabled',
      false,
    )
    expect(within(list).getByRole('button', { name: 'Deliver I-11a' })).toHaveProperty(
      'disabled',
      true,
    )
  })
})
