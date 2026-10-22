import { describe, expect, it } from 'vitest'
import { injectAlt, injectTypeLabel } from './inject-alt'

describe('injectAlt', () => {
  it('combines the title and the type label', () => {
    expect(injectAlt({ title: 'Gate B4 shows Miami', type: 'fids_board' })).toMatch(
      /^Gate B4 shows Miami — FIDS/,
    )
  })

  it('adds a detail, and falls back to the row id or a generic label', () => {
    expect(injectAlt({ title: ' ', type: 'tweet', mselRowId: 'I-03' }, 'preview')).toBe(
      'Inject I-03 — Tweet / X post, preview',
    )
    expect(injectAlt(undefined)).toBe('Inject')
  })

  it('keeps unknown types as their id', () => {
    expect(injectTypeLabel('mystery_type')).toBe('mystery_type')
    expect(injectTypeLabel(undefined)).toBeUndefined()
  })
})
