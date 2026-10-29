// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TallyBars } from './TallyBars'
import { leaders, percentOf } from './tally-model'
import { voteView } from './vote-fixtures'

afterEach(() => cleanup())

describe('TallyBars', () => {
  it('puts every count and percent in the DOM as text, not only in the bar width', () => {
    render(<TallyBars view={voteView()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText('7')).toBeTruthy()
    expect(within(rows[0]!).getByText('58 %')).toBeTruthy()
    expect(within(rows[1]!).getByText('25 %')).toBeTruthy()
    expect(within(rows[2]!).getByText('17 %')).toBeTruthy()
  })

  it('marks the leading option in words as well as by color', () => {
    render(<TallyBars view={voteView()} />)
    expect(screen.getAllByText('(leading)')).toHaveLength(1)
    expect(within(screen.getAllByRole('listitem')[0]!).getByText('(leading)')).toBeTruthy()
  })

  it('marks every option of a tie and none before anyone voted', () => {
    const tie = voteView({
      options: [
        { id: 'o1', label: 'A', count: 2 },
        { id: 'o2', label: 'B', count: 2 },
      ],
      voted: 4,
    })
    expect(leaders(tie)).toEqual(new Set(['o1', 'o2']))
    const none = voteView({
      options: [
        { id: 'o1', label: 'A', count: 0 },
        { id: 'o2', label: 'B', count: 0 },
      ],
      voted: 0,
    })
    expect(leaders(none).size).toBe(0)
    expect(percentOf(0, 0)).toBe(0)
  })

  it('splits bars by role with a legend and the role counts as text', () => {
    const view = voteView({
      anonymous: false,
      options: [
        { id: 'o1', label: 'Yes', count: 4 },
        { id: 'o2', label: 'No', count: 1 },
      ],
      voted: 5,
      byRole: [
        { roleId: 'ops', label: 'Operations', optionId: 'o1', count: 3 },
        { roleId: 'other', label: 'Other', optionId: 'o1', count: 1 },
        { roleId: 'other', label: 'Other', optionId: 'o2', count: 1 },
      ],
    })
    render(<TallyBars view={view} />)
    const legend = screen.getByRole('list', { name: 'Roles' })
    expect(within(legend).getByText('Operations')).toBeTruthy()
    expect(within(legend).getByText('Other')).toBeTruthy()
    expect(screen.getByText('Operations 3 · Other 1')).toBeTruthy()
  })
})
