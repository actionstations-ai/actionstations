// @vitest-environment happy-dom
// Gallery cards for built-in and pack examples (#266), with provenance badges (#269).
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExampleInfo } from '@shared/ipc'
import { ExampleCard } from './ExamplesSection'
import { exampleKey, exampleProvenance } from './example-label'

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

  it('gives a pack example badge data; a built-in gets none', () => {
    expect(exampleProvenance(builtin)).toBeUndefined()
    expect(exampleProvenance(fromPack)).toEqual({
      origin: 'pack',
      packId: 'ai.actionstations.freight-rail',
      packName: 'Freight Rail Operations',
      version: '1.0.0',
    })
  })

  it('renders both cards with distinct headings and the pack badge on the pack one only', () => {
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
    const [line] = screen.getAllByTestId('example-pack')
    expect(screen.getAllByTestId('example-pack')).toHaveLength(1)
    const badge = within(line!).getByRole('img', {
      name: 'From pack Freight Rail Operations 1.0.0',
    })
    expect(badge.textContent).toBe('Pack: Freight Rail Operations 1.0.0')
    expect(line!.textContent).toMatch(/License CC-BY-4\.0$/)
  })
})
