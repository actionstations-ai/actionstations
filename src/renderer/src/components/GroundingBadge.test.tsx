// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GroundingResult } from '@shared/schemas/grounding'
import { GroundingBadge } from './GroundingBadge'

afterEach(() => cleanup())

const result = (over: Partial<GroundingResult> = {}): GroundingResult => ({
  label: 'review',
  reason: '‘SOP 4.2’ is not in 5.3 Reporting.',
  fingerprint: 'f',
  claims: [],
  at: '2026-10-28T00:00:00.000Z',
  version: 1,
  ...over,
})

describe('GroundingBadge', () => {
  it('shows the label as a word with an icon and names it for screen readers', () => {
    render(<GroundingBadge result={result()} />)
    const badge = screen.getByRole('img', { name: 'Source check: Needs review (automatic check)' })
    expect(badge.textContent).toBe('Needs review')
    expect(badge.querySelector('svg')).toBeTruthy()
    expect(badge.className).toContain('badge--warn')
    expect(badge.getAttribute('title')).toContain('SOP 4.2')
  })

  it('uses the short word in the grid and says who set the label', () => {
    render(
      <GroundingBadge
        compact
        result={result({ override: { label: 'unsupported', at: '2026-10-28T00:00:00.000Z' } })}
      />,
    )
    const badge = screen.getByRole('img', { name: 'Source check: Unsupported (set by you)' })
    expect(badge.textContent).toBe('Unsupported')
    expect(badge.className).toContain('badge--error')
  })

  it('shows the model’s label when it was asked', () => {
    render(
      <GroundingBadge
        compact
        result={result({
          model: {
            label: 'grounded',
            at: 'x',
            providerId: 'm',
            model: 'm',
            quotes: [],
            discarded: 0,
          },
        })}
      />,
    )
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Source check: Grounded (checked with the model)',
    )
  })

  it('renders nothing for an item with no plan claim or no result yet', () => {
    const { container } = render(
      <>
        <GroundingBadge result={result({ label: 'none' })} />
        <GroundingBadge result={undefined} />
      </>,
    )
    expect(container.textContent).toBe('')
  })
})
