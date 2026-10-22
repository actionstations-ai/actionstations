import { describe, expect, it } from 'vitest'
import type { ObjectivesRolesOutput, Scenario } from '@shared/schemas'
import { applyObjectivesRoles } from './mappers'

const role = (key: string, name: string): ObjectivesRolesOutput['roles'][number] => ({
  key,
  name,
  abbreviation: key.toUpperCase().slice(0, 3),
  team: 'Team',
  description: '',
  standingOrders: [],
})

const scenario = (): Scenario =>
  ({ objectives: [], roles: [], criticalResources: [] }) as unknown as Scenario

describe('applyObjectivesRoles', () => {
  it('drops a "Critical Resources" pseudo-role the model mirrored from the field names', () => {
    const s = scenario()
    applyObjectivesRoles(s, {
      objectives: [{ name: 'Communication', text: 'x' }],
      roles: [
        role('ops', 'Dam Operations Manager'),
        role('pio', 'Public Affairs Officer'),
        role('criticalResources', 'Critical Resources'),
      ],
      criticalResources: ['Spillway gates'],
    })
    expect(s.roles.map((r) => r.id)).toEqual(['ops', 'pio'])
    expect(s.criticalResources).toEqual(['Spillway gates'])
  })

  it('keeps the roles as given when fewer than two real roles would remain', () => {
    const s = scenario()
    applyObjectivesRoles(s, {
      objectives: [{ name: 'Communication', text: 'x' }],
      roles: [role('ops', 'Operations'), role('board', 'Status Board')],
      criticalResources: [],
    })
    expect(s.roles).toHaveLength(2)
  })
})
