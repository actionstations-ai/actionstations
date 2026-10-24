// @vitest-environment happy-dom
// Pack domains in Project settings (#263): the picker names a snapshot whose pack is gone,
// and "Update profile from pack" shows the field diff before replacing the copy.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import { registerPackProfiles } from '@shared/domains'
import { freightRailEntry, freightRailProfile } from '@shared/domains/pack-fixtures'
import { DomainProfilePicker } from '../../components/DomainProfilePicker'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { PackProfileUpdate } from './PackProfileUpdate'

const PATH = '/projects/Rail.asproj'
const snapshot = {
  profile: freightRailProfile(),
  packId: 'org.example.freight-rail',
  version: '1.0.0',
  packName: 'Freight Rail',
}

afterEach(() => {
  cleanup()
  registerPackProfiles([])
})

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

describe('pack domain profiles in Project settings (#263)', () => {
  it('shows the snapshot as "from <pack> (not installed)" when the pack is gone', () => {
    wrap(<DomainProfilePicker value="freight_rail" snapshot={snapshot} onChange={() => {}} />)
    expect(screen.getByTestId('domain-current').textContent).toContain(
      'Freight railroad from Freight Rail (not installed)',
    )
    const option = screen.getByRole('option', { selected: true })
    expect(option.textContent).toContain('from Freight Rail (not installed)')
  })

  it('labels an installed pack profile with its pack', () => {
    registerPackProfiles([freightRailEntry()])
    wrap(<DomainProfilePicker value="transit" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'From packs' }).textContent).toContain(
      'Freight railroad from Freight Rail',
    )
  })

  it('offers no update while the installed version matches the snapshot', () => {
    registerPackProfiles([freightRailEntry('1.0.0')])
    wrap(<PackProfileUpdate path={PATH} snapshot={snapshot} />)
    expect(screen.queryByTestId('pack-profile-update')).toBeNull()
  })

  it('shows the field diff and updates only on request', async () => {
    registerPackProfiles([freightRailEntry('2.0.0', { outsideParties: ['FRA', 'STB'] })])
    const ttx = mockTtx({ 'project:update': () => ({ path: PATH, project: {} }) as never })
    wrap(<PackProfileUpdate path={PATH} snapshot={snapshot} />)
    expect(screen.getByTestId('pack-profile-update').textContent).toMatch(
      /Freight Rail 2\.0\.0 .* version 1\.0\.0/,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Show changes (1)' }))
    expect(screen.getByTestId('profile-diff-field').textContent).toBe(
      'Outside parties: adds STB; removes Shippers',
    )
    expect(ttx.calls('project:update')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Update profile from pack' }))
    await waitFor(() =>
      expect(ttx.calls('project:update')).toEqual([
        { path: PATH, patch: { refreshDomainProfileSnapshot: true } },
      ]),
    )
  })
})
