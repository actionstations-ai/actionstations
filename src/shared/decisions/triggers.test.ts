import { describe, expect, it } from 'vitest'
import { DecisionForm as ToolkitForm } from '../toolkits/schema'
import { decisionTriggers } from './triggers'

const form = {
  fires: [
    {
      regulationId: 'sec_8k_105',
      triggerId: 'materiality_determined',
      fieldId: 'determination',
      optionId: 'material',
    },
    { regulationId: 'nydfs_500_17', triggerId: 'incident_determined' },
  ],
}

describe('decisions that fire clock triggers', () => {
  it('fires the trigger whose choice was made, and unconditional ones always', () => {
    expect(decisionTriggers(form, { fields: { determination: 'material' } })).toEqual([
      { regulationId: 'sec_8k_105', triggerId: 'materiality_determined' },
      { regulationId: 'nydfs_500_17', triggerId: 'incident_determined' },
    ])
    expect(decisionTriggers(form, { fields: { determination: 'not_material' } })).toEqual([
      { regulationId: 'nydfs_500_17', triggerId: 'incident_determined' },
    ])
  })
  it('fires nothing for a form without triggers or an unknown form', () => {
    expect(decisionTriggers({}, { fields: {} })).toEqual([])
    expect(decisionTriggers(undefined, { fields: {} })).toEqual([])
  })
})

describe('toolkit forms that name triggers', () => {
  const base = {
    id: 'f',
    label: 'F',
    fields: [{ id: 'c', label: 'C', kind: 'choice', choices: ['Yes', 'No'] }],
  }
  it('accepts a trigger tied to a choice of the form', () => {
    expect(() =>
      ToolkitForm.parse({
        ...base,
        firesTriggers: [{ regulation: 'r', trigger: 't', field: 'c', equals: 'Yes' }],
      }),
    ).not.toThrow()
  })
  it('refuses a choice the form does not have, or a field without a choice', () => {
    expect(() =>
      ToolkitForm.parse({
        ...base,
        firesTriggers: [{ regulation: 'r', trigger: 't', field: 'c', equals: 'Maybe' }],
      }),
    ).toThrow(/choice/)
    expect(() =>
      ToolkitForm.parse({
        ...base,
        firesTriggers: [{ regulation: 'r', trigger: 't', field: 'c' }],
      }),
    ).toThrow(/go together/)
  })
})
