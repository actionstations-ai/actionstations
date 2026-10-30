// Rule suggestions stored on generated MSEL rows (spec 0426 FR-11).
import { describe, expect, it } from 'vitest'
import { bundledFrameworks } from '@shared/compliance/bundled'
import { mselRow } from '@shared/branching/fixture'
import type { Scenario } from '@shared/schemas'
import { applyRuleSuggestions, ruleSuggestions } from './control-suggestions'

const csf = [bundledFrameworks().get('nist_csf_2')!]
const scenario = { brief: { threatFamily: 'cyber' } } as unknown as Scenario

describe('rule suggestions', () => {
  it('suggests the controls whose rule matches the row, minus those already accepted', () => {
    const row = mselRow('I-01', '1:00', { purposeTag: 'CLUE' })
    const all = ruleSuggestions(csf, row, scenario)
    expect(all).toContain('nist_csf_2:DE.AE-02')
    const accepted = { ...row, controls: ['nist_csf_2:DE.AE-02'] }
    expect(ruleSuggestions(csf, accepted, scenario)).not.toContain('nist_csf_2:DE.AE-02')
  })

  it('stores suggestions on the rows, keeps model suggestions, and clears rows that match nothing', () => {
    const clue = mselRow('I-01', '1:00', {
      purposeTag: 'CLUE',
      controlSuggestions: [{ ref: 'nist_csf_2:RS.MA-01', by: 'model' }],
    })
    const plain = mselRow('I-02', '1:10', {
      purposeTag: 'NOISE',
      controlSuggestions: [{ ref: 'nist_csf_2:RS.MA-01', by: 'rule' }],
    })
    const touched = applyRuleSuggestions(csf, scenario, [clue, plain])
    expect(touched).toBe(1)
    expect(clue.controlSuggestions!.some((s) => s.by === 'model')).toBe(true)
    expect(clue.controlSuggestions!.some((s) => s.by === 'rule')).toBe(true)
    expect(plain.controlSuggestions).toBeUndefined()
  })

  it('does nothing without a framework', () => {
    const row = mselRow('I-01', '1:00', { purposeTag: 'CLUE' })
    expect(applyRuleSuggestions([], scenario, [row])).toBe(0)
    expect(row.controlSuggestions).toBeUndefined()
  })
})
