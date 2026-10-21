// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiKeyField, type KeyChange } from './ApiKeyField'

function Harness(props: { hasKey: boolean; onValue?: (v: KeyChange) => void }) {
  const [value, setValue] = useState<KeyChange>(undefined)
  return (
    <>
      <ApiKeyField
        hasKey={props.hasKey}
        required
        value={value}
        onChange={(v) => {
          setValue(v)
          props.onValue?.(v)
        }}
      />
      <output data-testid="value">
        {value === undefined ? 'keep' : value === null ? 'clear' : 'set'}
      </output>
    </>
  )
}

afterEach(() => cleanup())

describe('ApiKeyField', () => {
  it('is an empty password input when no key is stored', async () => {
    const seen: KeyChange[] = []
    render(<Harness hasKey={false} onValue={(v) => seen.push(v)} />)
    const input = screen.getByLabelText('API key') as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.value).toBe('')
    await userEvent.type(input, 'sk-abc')
    expect(seen.at(-1)).toBe('sk-abc')
    expect(screen.getByTestId('value').textContent).toBe('set')
  })

  it('shows "Key stored" without any input or key text when a key exists', () => {
    const { container } = render(<Harness hasKey />)
    expect(screen.getByText('Key stored')).toBeTruthy()
    expect(container.querySelector('input')).toBeNull()
    expect(container.textContent).not.toMatch(/sk-/)
  })

  it('Replace opens an empty input, never prefilled; Cancel keeps the stored key', async () => {
    render(<Harness hasKey />)
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
    const input = screen.getByLabelText('API key') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.type).toBe('password')
    await userEvent.type(input, 'new-key')
    expect(screen.getByTestId('value').textContent).toBe('set')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Key stored')).toBeTruthy()
    expect(screen.getByTestId('value').textContent).toBe('keep')
  })

  it('Clear marks the key for removal and can be undone', async () => {
    render(<Harness hasKey />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Key will be removed on save')).toBeTruthy()
    expect(screen.getByTestId('value').textContent).toBe('clear')
    await userEvent.click(screen.getByRole('button', { name: 'Keep key' }))
    expect(screen.getByTestId('value').textContent).toBe('keep')
  })
})
