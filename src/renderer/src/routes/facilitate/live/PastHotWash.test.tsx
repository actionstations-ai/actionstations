// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import type { BoardView, HotWashItem } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { PastHotWashView } from './PastHotWash'

afterEach(cleanup)

const scenario = { objectives: [], hotwash: { questions: [] } } as unknown as Scenario

const item = (n: number, over: Partial<HotWashItem> = {}): HotWashItem => ({
  itemId: `item-${n}`,
  kind: 'improvement',
  text: `Item ${n}`,
  anonymous: false,
  roleLabel: 'Ops Director',
  at: n,
  exerciseTime: '1:20',
  accepted: true,
  hidden: false,
  plus: 2,
  promoted: false,
  ...over,
})

const board = (items: HotWashItem[], groups: BoardView['groups'] = []): BoardView => ({
  open: false,
  review: false,
  items,
  groups,
  questions: [],
})

describe('PastHotWashView', () => {
  it('shows the columns read only, with groups named and no selection boxes', () => {
    const { container } = render(
      <PastHotWashView
        scenario={scenario}
        board={board(
          [
            item(1, { kind: 'strength', text: 'Clear PA script' }),
            item(2, { groupId: 'g1' }),
            item(3, { groupId: 'g1' }),
          ],
          [
            {
              groupId: 'g1',
              label: 'Incident numbers',
              itemIds: ['item-2', 'item-3'],
              promoted: true,
            },
          ],
        )}
      />,
    )
    expect(
      within(screen.getByRole('region', { name: /Strengths/ })).getByText('Clear PA script'),
    ).toBeTruthy()
    expect(screen.getByText('Incident numbers')).toBeTruthy()
    expect(screen.getByText(/2 items · ▲ 4 · Promoted/)).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('says so when the session had no hot wash', () => {
    render(<PastHotWashView scenario={scenario} board={board([])} />)
    expect(screen.getByText('This session has no hot wash items.')).toBeTruthy()
  })

  it('has no axe violations', async () => {
    render(
      <PastHotWashView scenario={scenario} board={board([item(1), item(2, { kind: 'other' })])} />,
    )
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
