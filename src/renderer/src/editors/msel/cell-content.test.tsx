// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { registerInjectTypes } from '@shared/taxonomy'
import { formatListOptions } from './cell-content'

afterEach(() => {
  cleanup()
  registerInjectTypes([])
})

describe('formatListOptions (#269)', () => {
  it('shows a provenance badge on a format a pack template adds', () => {
    registerInjectTypes([
      {
        id: 'yard_radio_log',
        label: 'Yard radio log',
        category: 'voice',
        render: ['tts'],
        paper: false,
        mvp: false,
        defaultDelivery: 'play_audio',
        source: 'pack',
        pack: { id: 'ai.actionstations.freight-rail', version: '1.0.0', name: 'Freight Rail' },
      },
    ])
    const options = formatListOptions()
    const yard = options.find((o) => o.value === 'yard_radio_log')!
    render(
      <ul role="listbox" aria-label="Format">
        <li role="option" aria-selected={false}>
          {yard.render}
        </li>
      </ul>,
    )
    const badge = screen.getByRole('img', { name: 'From pack Freight Rail 1.0.0' })
    expect(badge.textContent).toBe('Pack: Freight Rail 1.0.0')
    expect(screen.getByRole('option').textContent).toMatch(/^Yard radio log/)
    // Built-in formats keep their plain label.
    expect(options.find((o) => o.value === 'tweet')?.render).toBeUndefined()
  })
})
