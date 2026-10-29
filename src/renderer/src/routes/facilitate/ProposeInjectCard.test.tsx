// @vitest-environment happy-dom
// The proposal card shows the source check of the proposed inject (#423): an unsupported row
// offers "Accept anyway" instead of the plain accept.
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mselRow } from '@shared/branching/fixture'
import type { GroundingResult } from '@shared/schemas/grounding'
import { ProposalCard } from './ProposeInjectCard'

afterEach(() => cleanup())

const grounding = (label: GroundingResult['label'], reason: string): GroundingResult => ({
  label,
  reason,
  fingerprint: 'f',
  claims: [],
  at: '2026-01-01T00:00:00.000Z',
  version: 1,
})

const show = (g?: GroundingResult) =>
  render(
    <ProposalCard
      result={{ row: mselRow('I-10-B1-3', '1:50', { branchId: 'b1' }), hash: 'h', grounding: g }}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    />,
  )

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }

describe('ProposalCard', () => {
  it('shows the label and reason, and the plain accept, for a grounded row', async () => {
    show(grounding('grounded', 'Matches section 4.2.'))
    expect(screen.getByTestId('grounding-badge').getAttribute('data-label')).toBe('grounded')
    expect(screen.getByText('Matches section 4.2.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Accept and add to the branch' })).toBeTruthy()
    expect((await axe.run(document.body, AXE)).violations.map((v) => v.id)).toEqual([])
  })

  it('offers Accept anyway for an unsupported row', async () => {
    show(grounding('unsupported', 'No document says this.'))
    expect(screen.getByRole('button', { name: 'Accept anyway' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept and add to the branch' })).toBeNull()
    expect((await axe.run(document.body, AXE)).violations.map((v) => v.id)).toEqual([])
  })

  it('still works when no source check could be computed', () => {
    show(undefined)
    expect(screen.queryByTestId('grounding-badge')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
  })
})
