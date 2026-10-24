// @vitest-environment happy-dom
// Pack domains in Project settings (#263): the picker names a snapshot whose pack is gone,
// and "Update profile from pack" shows the field diff before replacing the copy.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
  it('badges the snapshot "not installed" when the pack is gone (#269)', () => {
    wrap(<DomainProfilePicker value="heritage_rail" snapshot={snapshot} onChange={() => {}} />)
    const current = screen.getByTestId('domain-current')
    expect(current.textContent).toContain('Freight railroad')
    expect(
      within(current).getByRole('img', {
        name: 'Project copy from pack Freight Rail 1.0.0, pack not installed',
      }).textContent,
    ).toBe('From Freight Rail 1.0.0not installed')
    const option = screen.getByRole('option', { selected: true })
    expect(within(option).getByRole('img', { name: /Freight Rail.*not installed/ })).toBeTruthy()
  })

  it('badges the snapshot "Update available" when the pack has another version (#269)', () => {
    registerPackProfiles([freightRailEntry('2.0.0')])
    wrap(<DomainProfilePicker value="heritage_rail" snapshot={snapshot} onChange={() => {}} />)
    const badge = within(screen.getByTestId('domain-current')).getByRole('img', {
      name: /Freight Rail/,
    })
    expect(badge.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail 1.0.0, update available (2.0.0 installed)',
    )
  })

  it('labels an installed pack profile with its pack', () => {
    registerPackProfiles([freightRailEntry()])
    wrap(<DomainProfilePicker value="transit" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: 'From packs' })
    expect(group.textContent).toContain('Freight railroad')
    expect(within(group).getByRole('img', { name: /^From pack Freight Rail/ })).toBeTruthy()
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
