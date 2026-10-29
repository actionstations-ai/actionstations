// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardView, HotWashItem } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { cellsFor, promotedLines, selectionFacts, senderLabel } from './hotwash-model'
import { HotWashBoardView } from './HotWashBoard'
import type { LiveHotwash } from './use-live-hotwash'

afterEach(cleanup)

const scenario = {
  id: 'S1',
  objectives: [{ id: 'obj-1', name: 'Coordinate', text: 'Coordinate' }],
  msel: [{ id: 'I-06', time: '1:20' }],
  evaluation: { objectiveCapabilities: [], eegs: [] },
  hotwash: {
    method: '3up3down',
    methodDescription: '',
    questions: [{ topic: 'Ops/IT', text: 'Q' }],
  },
} as unknown as Scenario

const item = (n: number, over: Partial<HotWashItem> = {}): HotWashItem => ({
  itemId: `item-${n}`,
  kind: 'improvement',
  text: `Item ${n}`,
  anonymous: false,
  roleLabel: 'PIO',
  at: 1_700_000_000_000 + n,
  exerciseTime: '1:20',
  accepted: true,
  hidden: false,
  plus: 0,
  promoted: false,
  ...over,
})

const board = (items: HotWashItem[], over: Partial<BoardView> = {}): BoardView => ({
  open: true,
  review: false,
  items,
  groups: [],
  questions: [],
  ...over,
})

function fakeLive(b: BoardView | undefined, over: Partial<LiveHotwash> = {}): LiveHotwash {
  return {
    active: true,
    board: b,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    setReview: vi.fn(async () => undefined),
    act: vi.fn(async () => undefined),
    promote: vi.fn(async () => undefined),
    unpromote: vi.fn(async () => undefined),
    present: vi.fn(async () => undefined),
    ...over,
  }
}

const show = (live: LiveHotwash) => render(<HotWashBoardView scenario={scenario} live={live} />)

describe('board model', () => {
  it('puts items in their column, most +1 first, groups as one cell', () => {
    const b = board(
      [
        item(1, { plus: 1 }),
        item(2, { plus: 3, groupId: 'g' }),
        item(3, { plus: 2, groupId: 'g' }),
        item(4, { kind: 'strength' }),
        item(5, { hidden: true }),
        item(6, { accepted: false }),
      ],
      {
        groups: [
          { groupId: 'g', label: 'Numbers', itemIds: ['item-2', 'item-3'], promoted: false },
        ],
      },
    )
    const cells = cellsFor(b, 'improvement')
    expect(cells.map((c) => c.type)).toEqual(['group', 'item'])
    expect(cells[0]!.plus).toBe(5)
    expect(cellsFor(b, 'strength')).toHaveLength(1)
    expect(cellsFor(b, 'other')).toHaveLength(0)
  })

  it('names the sender by role, or anonymous, never by a device', () => {
    expect(senderLabel(item(1))).toBe('PIO')
    expect(senderLabel(item(1, { anonymous: true, roleLabel: undefined }))).toBe('anonymous')
    expect(senderLabel(item(1, { displayName: 'Pat' }))).toBe('PIO (Pat)')
  })

  it('says what a selection allows', () => {
    const b = board([
      item(1),
      item(2, { groupId: 'g', promoted: true }),
      item(3, { accepted: false }),
    ])
    expect(selectionFacts(b, new Set(['item-1']))).toMatchObject({ canGroup: false, canEdit: true })
    expect(selectionFacts(b, new Set(['item-1', 'item-2']))).toMatchObject({
      canGroup: true,
      canUngroup: true,
      anyPromoted: true,
      allPromoted: false,
    })
    expect(selectionFacts(b, new Set(['item-1', 'item-3'])).canGroup).toBe(false)
  })

  it('builds the projector lines from promoted items only, without roles or counts', () => {
    const b = board(
      [
        item(1, { promoted: true, plus: 9 }),
        item(2, { promoted: true, groupId: 'g' }),
        item(3, { promoted: true, groupId: 'g' }),
        item(4),
      ],
      {
        groups: [
          { groupId: 'g', label: 'Numbering', itemIds: ['item-2', 'item-3'], promoted: true },
        ],
      },
    )
    expect(promotedLines(b)).toEqual([
      { kind: 'improvement', text: 'Item 1' },
      { kind: 'improvement', text: 'Numbering' },
    ])
  })
})

describe('HotWashBoardView', () => {
  it('tells the facilitator to start a session when there is none', () => {
    show(fakeLive(undefined, { active: false }))
    expect(screen.getByText(/Start a live session/)).toBeTruthy()
  })

  it('opens the hot wash on devices', () => {
    const live = fakeLive(board([], { open: false }))
    show(live)
    fireEvent.click(screen.getByRole('button', { name: 'Open on devices' }))
    expect(live.open).toHaveBeenCalledWith(false)
  })

  it('switches to review before showing', () => {
    const live = fakeLive(board([], { open: false }))
    show(live)
    fireEvent.click(screen.getByLabelText('Review before showing'))
    expect(live.setReview).toHaveBeenCalledWith(true)
  })

  it('lists columns as headed lists with role or anonymous on each item', () => {
    show(
      fakeLive(
        board([item(1), item(2, { anonymous: true, roleLabel: undefined, kind: 'strength' })]),
      ),
    )
    const improvements = screen.getByRole('region', { name: /Improvements/ })
    expect(within(improvements).getByText(/PIO/)).toBeTruthy()
    const strengths = screen.getByRole('region', { name: /Strengths/ })
    expect(within(strengths).getByText(/anonymous/)).toBeTruthy()
  })

  it('groups the selected items with the keyboard-friendly checkboxes and a button', () => {
    const live = fakeLive(board([item(1), item(2), item(3)]))
    show(live)
    expect(
      (screen.getByRole('button', { name: 'Group selected' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByLabelText('Select: Item 1'))
    fireEvent.click(screen.getByLabelText('Select: Item 2'))
    fireEvent.click(screen.getByRole('button', { name: 'Group selected' }))
    expect(live.act).toHaveBeenCalledWith({ action: 'group', itemIds: ['item-1', 'item-2'] })
  })

  it('promotes the selection and offers Unpromote when all of it is promoted', () => {
    const live = fakeLive(board([item(1), item(2, { promoted: true })]))
    show(live)
    fireEvent.click(screen.getByLabelText('Select: Item 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Promote' }))
    expect(live.promote).toHaveBeenCalledWith('item-1')
    cleanup()
    const again = fakeLive(board([item(2, { promoted: true })]))
    show(again)
    fireEvent.click(screen.getByLabelText('Select: Item 2'))
    fireEvent.click(screen.getByRole('button', { name: 'Unpromote' }))
    expect(again.unpromote).toHaveBeenCalledWith('item-2')
  })

  it('promotes a group once however many of its items are selected', () => {
    const b = board([item(1, { groupId: 'g' }), item(2, { groupId: 'g' })], {
      groups: [{ groupId: 'g', label: 'Numbers', itemIds: ['item-1', 'item-2'], promoted: false }],
    })
    const live = fakeLive(b)
    show(live)
    fireEvent.click(screen.getByLabelText('Select all 2 items in group Numbers'))
    fireEvent.click(screen.getByRole('button', { name: 'Promote' }))
    expect(live.promote).toHaveBeenCalledTimes(1)
    expect(live.promote).toHaveBeenCalledWith('g')
  })

  it('edits the text of one item', () => {
    const live = fakeLive(board([item(1)]))
    show(live)
    fireEvent.click(screen.getByLabelText('Select: Item 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }))
    fireEvent.change(screen.getByLabelText('Item text'), { target: { value: 'Fixed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }))
    expect(live.act).toHaveBeenCalledWith({ action: 'edit', itemIds: ['item-1'], text: 'Fixed' })
  })

  it('names a group', () => {
    const b = board([item(1, { groupId: 'g' }), item(2, { groupId: 'g' })], {
      groups: [{ groupId: 'g', itemIds: ['item-1', 'item-2'], promoted: false }],
    })
    const live = fakeLive(b)
    show(live)
    fireEvent.click(screen.getByLabelText('Select: Item 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Name group' }))
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Numbering' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(live.act).toHaveBeenCalledWith({
      action: 'label',
      itemIds: ['item-1'],
      label: 'Numbering',
    })
  })

  it('tags with an objective and an inject', () => {
    const live = fakeLive(board([item(1)]))
    show(live)
    fireEvent.click(screen.getByLabelText('Select: Item 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    fireEvent.change(screen.getByLabelText('Objective'), { target: { value: 'obj-1' } })
    fireEvent.change(screen.getByLabelText('Inject'), { target: { value: 'I-06' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply tags' }))
    expect(live.act).toHaveBeenCalledWith({
      action: 'tag',
      itemIds: ['item-1'],
      tags: { objectiveId: 'obj-1', mselRowId: 'I-06' },
    })
  })

  it('hides the selection, and restores from the hidden list', () => {
    const live = fakeLive(board([item(1), item(2, { hidden: true })]))
    show(live)
    fireEvent.click(screen.getByLabelText('Select: Item 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(live.act).toHaveBeenCalledWith({ action: 'hide', itemIds: ['item-1'] })
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(live.act).toHaveBeenCalledWith({ action: 'restore', itemIds: ['item-2'] })
  })

  it('holds items for review and accepts one', () => {
    const live = fakeLive(board([item(1, { accepted: false })], { review: true }))
    show(live)
    expect(screen.getByRole('region', { name: 'Waiting for review' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(live.act).toHaveBeenCalledWith({ action: 'accept', itemIds: ['item-1'] })
  })

  it('shows the board on screen', () => {
    const live = fakeLive(board([]))
    show(live)
    fireEvent.click(screen.getByRole('button', { name: 'Show on screen' }))
    expect(live.present).toHaveBeenCalled()
  })
})
