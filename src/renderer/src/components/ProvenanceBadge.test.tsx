// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { provenanceOf, provenanceText, type Provenance } from '../lib/provenance'
import { ProvenanceBadge } from './ProvenanceBadge'

afterEach(() => cleanup())

const PACK = { packId: 'ai.actionstations.freight-rail', packName: 'Freight Rail Operations' }

function badge(p: Provenance) {
  render(<ProvenanceBadge provenance={p} />)
  return screen.getByRole('img', { name: /Freight Rail Operations/ })
}

const chips = (el: HTMLElement) => [...el.querySelectorAll('.badge')].map((c) => c.textContent)

describe('ProvenanceBadge', () => {
  it('names the pack and its version for an item served from a pack', () => {
    const el = badge({ origin: 'pack', ...PACK, version: '1.0.0' })
    expect(chips(el)).toEqual(['Pack: Freight Rail Operations 1.0.0'])
    expect(el.getAttribute('aria-label')).toBe('From pack Freight Rail Operations 1.0.0')
    expect(el.querySelector('.badge--info')).toBeTruthy()
  })

  it('says "From" for a project copy', () => {
    const el = badge({ origin: 'copy', ...PACK, version: '1.0.0' })
    expect(chips(el)).toEqual(['From Freight Rail Operations 1.0.0'])
    expect(el.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail Operations 1.0.0',
    )
  })

  it('shows "edited" when the copy differs from packs.json', () => {
    const el = badge({ origin: 'copy', ...PACK, version: '1.0.0', edited: true })
    expect(chips(el)).toEqual(['From Freight Rail Operations 1.0.0', 'edited'])
    expect(el.getAttribute('aria-label')).toMatch(/Freight Rail Operations 1\.0\.0, edited$/)
    // A word and an icon, not colour alone.
    expect(el.querySelector('[data-state="edited"] svg')).toBeTruthy()
  })

  it('shows "not installed" when the pack is gone, and no update then', () => {
    const el = badge({
      origin: 'copy',
      ...PACK,
      version: '1.0.0',
      packMissing: true,
      updateAvailable: true,
    })
    expect(chips(el)).toEqual(['From Freight Rail Operations 1.0.0', 'not installed'])
    expect(el.getAttribute('aria-label')).toMatch(/pack not installed$/)
  })

  it('shows "Update available" with the installed version in the name', () => {
    const el = badge({
      origin: 'copy',
      ...PACK,
      version: '1.0.0',
      updateAvailable: true,
      installedVersion: '1.1.0',
    })
    expect(chips(el)).toEqual(['From Freight Rail Operations 1.0.0', 'Update available'])
    expect(el.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail Operations 1.0.0, update available (1.1.0 installed)',
    )
  })

  it('combines states and falls back to the pack id without a name', () => {
    render(
      <ProvenanceBadge
        provenance={{ origin: 'copy', packId: PACK.packId, edited: true, updateAvailable: true }}
      />,
    )
    const el = screen.getByRole('img', { name: /ai\.actionstations\.freight-rail/ })
    expect(chips(el)).toEqual(['From ai.actionstations.freight-rail', 'edited', 'Update available'])
  })
})

describe('provenanceOf', () => {
  it('is undefined for built-in, user and plain project items', () => {
    expect(provenanceOf({ source: 'builtin' })).toBeUndefined()
    expect(provenanceOf({ source: 'project' })).toBeUndefined()
  })

  it('maps a pack item and a copy with its state', () => {
    expect(provenanceOf({ source: 'pack', packId: 'p', packVersion: '1.0.0' })).toEqual({
      origin: 'pack',
      packId: 'p',
      version: '1.0.0',
    })
    const copy = provenanceOf({
      source: 'project',
      packId: 'p',
      packName: 'P',
      packVersion: '1.0.0',
      copy: { edited: true, packMissing: false, updateAvailable: true, installedVersion: '2.0.0' },
    })
    expect(copy).toMatchObject({ origin: 'copy', edited: true, installedVersion: '2.0.0' })
    expect(provenanceText(copy!)).toBe('From P 1.0.0, edited, Update available')
  })
})
