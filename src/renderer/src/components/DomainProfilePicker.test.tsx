// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainProfilePicker } from './DomainProfilePicker'

afterEach(() => cleanup())

function Harness(props: { initial: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(props.initial)
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <DomainProfilePicker
        value={value}
        onChange={(v) => {
          setValue(v)
          props.onChange?.(v)
        }}
      />
      <output data-testid="value">{value}</output>
    </form>
  )
}

describe('DomainProfilePicker', () => {
  it('lists every profile in labelled groups with the current one selected', () => {
    render(<Harness initial="water_dam" />)
    const list = screen.getByRole('listbox', { name: 'Domain' })
    expect(within(list).getAllByRole('option')).toHaveLength(13)
    expect(within(list).getByRole('group', { name: 'Utilities and industry' })).toBeTruthy()
    const selected = within(list).getByRole('option', { selected: true })
    expect(selected.textContent).toMatch(/^Dam \/ water authority/)
    const combo = screen.getByRole('combobox', { name: 'Domain' })
    expect(combo.getAttribute('aria-activedescendant')).toBe(selected.id)
  })

  it('filters by search text and moves the selection with arrow keys', async () => {
    const onChange = vi.fn()
    render(<Harness initial="generic" onChange={onChange} />)
    const user = userEvent.setup()
    const combo = screen.getByRole('combobox', { name: 'Domain' })
    await user.type(combo, 'water')
    const options = screen.getAllByRole('option').map((o) => o.getAttribute('data-profile'))
    expect(options).toEqual(['water_dam', 'water_utility'])
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('value').textContent).toBe('water_dam')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('value').textContent).toBe('water_utility')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('water_utility')
  })

  it('says how a legacy organization type resolves', async () => {
    render(<Harness initial="hospital" />)
    expect(screen.getByTestId('orgtype-note').textContent).toMatch(
      /Saved as “hospital”, which uses the Healthcare profile/,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('option', { name: /^Healthcare/ }))
    expect(screen.getByTestId('value').textContent).toBe('healthcare')
    expect(screen.queryByTestId('orgtype-note')).toBeNull()
  })

  it('explains when nothing matches', async () => {
    render(<Harness initial="generic" />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox', { name: 'Domain' }), 'zzzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(/No profile matches/)).toBeTruthy()
  })
})
