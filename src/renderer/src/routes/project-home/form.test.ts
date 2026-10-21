import { describe, expect, it } from 'vitest'
import { Project } from '@shared/schemas'
import { emptyRole, isDirty, toFormState, toPatch, validateForm } from './form'

const now = '2026-10-21T12:00:00.000Z'
const project = Project.parse({
  id: 'p1',
  name: 'Northfield Regional',
  orgName: 'NRAA',
  orgType: 'airport',
  createdAt: now,
  updatedAt: now,
  appVersion: '0.0.1',
  brand: { city: 'Northfield', aliases: { localTv: 'WNFD 5' } },
  defaultRoles: [
    {
      id: 'asc',
      name: 'Airport Security Coordinator',
      abbreviation: 'ASC',
      standingOrders: ['Notify TSA', 'Open EOC'],
    },
  ],
})

describe('project settings form', () => {
  it('round-trips a project into a patch without changes', () => {
    const form = toFormState(project)
    expect(form.roles[0]?.standingOrdersText).toBe('Notify TSA\nOpen EOC')
    expect(toPatch(form)).toMatchObject({
      name: 'Northfield Regional',
      brand: { city: 'Northfield', region: '', aliases: { localTv: 'WNFD 5' } },
      defaultRoles: [{ id: 'asc', standingOrders: ['Notify TSA', 'Open EOC'] }],
    })
    expect(isDirty(form, project)).toBe(false)
  })

  it('splits standing orders by line and drops blanks', () => {
    const form = toFormState(project)
    form.roles[0]!.standingOrdersText = '  Notify TSA \n\n Brief PIO\n'
    expect(toPatch(form).defaultRoles[0]?.standingOrders).toEqual(['Notify TSA', 'Brief PIO'])
    expect(isDirty(form, project)).toBe(true)
  })

  it('ignores fully empty alias rows and flags missing or duplicate keys', () => {
    const form = toFormState(project)
    form.aliases.push({ rowId: 'x1', key: '', value: '' })
    expect(validateForm(form)).toEqual({})
    form.aliases.push({ rowId: 'x2', key: '', value: 'Delta' })
    form.aliases.push({ rowId: 'x3', key: 'localTv', value: 'Channel 9' })
    const errors = validateForm(form)
    expect(errors['alias:x2']).toMatch(/key/)
    expect(errors['alias:x3']).toMatch(/twice/)
  })

  it('requires a project name, role names and a hex color', () => {
    const form = toFormState(project)
    form.name = ' '
    form.primaryColor = 'blue'
    const role = emptyRole()
    form.roles.push(role)
    const errors = validateForm(form)
    expect(Object.keys(errors).sort()).toEqual(['name', 'primaryColor', `role:${role.id}`].sort())
  })

  it('creates role ids that are valid SafeIds', () => {
    expect(emptyRole().id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
  })
})
