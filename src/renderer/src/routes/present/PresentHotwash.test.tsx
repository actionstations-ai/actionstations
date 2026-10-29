// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BoardView, HotWashItem } from '@shared/schemas/live'
import { HotwashColumns } from './PresentHotwash'

afterEach(cleanup)

const item = (n: number, over: Partial<HotWashItem>): HotWashItem => ({
  itemId: `item-${n}`,
  kind: 'improvement',
  text: `Item ${n}`,
  anonymous: false,
  roleLabel: 'Ops Director',
  displayName: 'Pat',
  at: n,
  exerciseTime: '1:20',
  accepted: true,
  hidden: false,
  plus: 7,
  promoted: true,
  ...over,
})

const board = (items: HotWashItem[]): BoardView => ({
  open: true,
  review: false,
  items,
  groups: [],
  questions: [],
})

describe('PresentHotwash columns', () => {
  it('shows promoted items in two columns and the rest below, with no roles, names or counts', () => {
    const { container } = render(
      <HotwashColumns
        board={board([
          item(1, { kind: 'strength', text: 'Clear PA script' }),
          item(2, { text: 'Two incident numbers' }),
          item(3, { kind: 'other', text: 'Insider is a crime scene' }),
          item(4, { text: 'Not promoted', promoted: false }),
        ])}
      />,
    )
    expect(
      within(screen.getByRole('region', { name: 'Strengths' })).getByText('Clear PA script'),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Improvements' })).getByText(
        'Two incident numbers',
      ),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Other' })).getByText('Insider is a crime scene'),
    ).toBeTruthy()
    expect(screen.queryByText('Not promoted')).toBeNull()
    expect(container.textContent).not.toMatch(/Ops Director|Pat|▲|\b7\b/)
  })

  it('leaves out the Other section when nothing else was promoted', () => {
    render(<HotwashColumns board={board([item(1, { text: 'Only one' })])} />)
    expect(screen.queryByRole('region', { name: 'Other' })).toBeNull()
  })
})
