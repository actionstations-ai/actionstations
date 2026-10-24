// @vitest-environment happy-dom
// Gallery cards for built-in and pack examples (#266).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExampleInfo } from '@shared/ipc'
import { ExampleCard } from './ExamplesSection'
import { exampleKey, packLabel } from './example-label'

afterEach(() => cleanup())

const builtin: ExampleInfo = {
  id: 'mini-transit',
  slug: 'mini-transit',
  title: 'Lakeview Transit',
  domainProfile: 'transit',
  summary: 'A fictional transit agency.',
  fictional: true,
  notice: 'Fictional.',
  scenarios: [],
}
const fromPack: ExampleInfo = {
  ...builtin,
  title: 'Harbor Junction',
  packId: 'ai.actionstations.freight-rail',
  packVersion: '1.0.0',
  packName: 'Freight Rail Operations',
  packLicense: 'CC-BY-4.0',
}

describe('example gallery cards', () => {
  it('keys a pack example by its pack, so it may share a built-in slug', () => {
    expect(exampleKey(builtin)).toBe('mini-transit')
    expect(exampleKey(fromPack)).toBe('ai.actionstations.freight-rail/mini-transit')
  })

  it('labels a pack example with the pack and its license; a built-in gets no label', () => {
    expect(packLabel(builtin)).toBeNull()
    expect(packLabel(fromPack)).toBe(
      'From the Freight Rail Operations pack (1.0.0) · License CC-BY-4.0',
    )
    const { packName: _n, packVersion: _v, ...bare } = fromPack
    expect(packLabel(bare)).toBe('From the ai.actionstations.freight-rail pack · License CC-BY-4.0')
  })

  it('renders both cards with distinct headings and the pack line on the pack one only', () => {
    render(
      <ul>
        <ExampleCard example={builtin} onOpen={() => {}} />
        <ExampleCard example={fromPack} onOpen={() => {}} />
      </ul>,
    )
    const cards = screen.getAllByRole('listitem')
    expect(cards.map((c) => c.getAttribute('aria-labelledby'))).toEqual([
      'example-mini-transit',
      'example-ai-actionstations-freight-rail-mini-transit',
    ])
    expect(screen.getAllByTestId('example-pack').map((p) => p.textContent)).toEqual([
      'From the Freight Rail Operations pack (1.0.0) · License CC-BY-4.0',
    ])
  })
})
