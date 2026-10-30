// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MselRow, Phase } from '@shared/schemas/scenario'
import { Timeline, type TimelineEntry } from './Timeline'

afterEach(cleanup)

const phase: Phase = {
  id: 'p1',
  index: 0,
  title: 'One',
  goal: '',
  startTime: '0:00',
  endTime: '4:00',
}

const entry = (over: Partial<TimelineEntry>): TimelineEntry =>
  ({
    row: { id: 'I-07', phaseId: 'p1', time: '0:10', event: 'A reporter calls' } as MselRow,
    inject: undefined,
    target: 'PIO',
    thumbUrl: undefined,
    hasAudio: false,
    due: false,
    deliveredAt: '0:11',
    hasNote: false,
    availability: 'on_path',
    ...over,
  }) as TimelineEntry

function show(entries: TimelineEntry[]) {
  render(
    <Timeline
      phases={[phase]}
      entries={entries}
      selectedId={undefined}
      onSelect={vi.fn()}
      onDeliver={vi.fn()}
      onUndo={vi.fn()}
    />,
  )
}

describe('Timeline No response badge (#417)', () => {
  it('names the minutes in text on a delivered row the live session flagged', () => {
    show([entry({ unansweredMin: 12.6 })])
    expect(screen.getByText('No response · 12 min')).toBeTruthy()
  })

  it('shows nothing on a row nobody flagged', () => {
    show([entry({})])
    expect(screen.queryByText(/No response/)).toBeNull()
  })
})
