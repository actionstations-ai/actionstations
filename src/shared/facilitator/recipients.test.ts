import { describe, expect, it } from 'vitest'
import { addressedTo, recipients, teamNames } from './recipients'

const roles = [
  { id: 'ops-dir', name: 'Operations Director', abbreviation: 'OPS', team: 'Ops' },
  { id: 'ops-duty', name: 'Duty Manager', abbreviation: '', team: 'Ops' },
  { id: 'pio', name: 'Public Information Officer', abbreviation: 'PIO', team: 'Comms' },
  { id: 'asc', name: 'Security Coordinator', abbreviation: 'ASC', team: '' },
]
const row = (toRoleIds: string[], toTeams: string[] = [], toLabel?: string) => ({
  toRoleIds,
  toTeams,
  ...(toLabel ? { toLabel } : {}),
})

describe('recipients (spec 0428 FR-5)', () => {
  it('adds every role of a listed team to the listed roles', () => {
    const r = recipients(row(['pio'], ['Ops']), roles)
    expect(r.roleIds.sort()).toEqual(['ops-dir', 'ops-duty', 'pio'])
    expect(r.label).toBe('Ops team, PIO')
  })
  it('matches team names without regard to case', () => {
    expect(recipients(row([], ['comms']), roles).roleIds).toEqual(['pio'])
  })
  it('ignores a team no role is on', () => {
    expect(recipients(row([], ['Legal']), roles)).toMatchObject({ roleIds: [], label: '—' })
  })
  it('uses the written label when the row has one', () => {
    expect(recipients(row([], [], 'All'), roles).label).toBe('All')
  })
  it('does not repeat a role already covered by its team', () => {
    expect(recipients(row(['ops-dir'], ['Ops']), roles).label).toBe('Ops team')
  })
  it('lets one delivery override the plan', () => {
    const r = recipients(row(['pio']), roles, ['asc', 'asc'])
    expect(r).toEqual({ roleIds: ['asc'], teams: [], label: 'ASC' })
  })
})

describe('addressedTo and teamNames', () => {
  it('filters by role and by team', () => {
    const r = row(['pio'], ['Ops'])
    expect(addressedTo(r, roles, { roleId: 'ops-duty' })).toBe(true)
    expect(addressedTo(r, roles, { team: 'Comms' })).toBe(true)
    expect(addressedTo(row(['asc']), roles, { team: 'Ops' })).toBe(false)
    expect(addressedTo(r, roles, {})).toBe(true)
  })
  it('shows a row for everyone under every filter', () => {
    expect(addressedTo(row([], [], 'All'), roles, { team: 'Ops' })).toBe(true)
  })
  it('lists the teams once, sorted', () => {
    expect(teamNames(roles)).toEqual(['Comms', 'Ops'])
  })
})
