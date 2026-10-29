import { describe, expect, it } from 'vitest'
import { draftFromProposal, emptyDraft, toBrief, validateDraft } from './brief-form'

describe('draftFromProposal (#424)', () => {
  it('turns the program proposal into constraints and remembers the corrective actions', () => {
    const draft = draftFromProposal({
      programProposal: {
        constraints: ['Must test the Cybersecurity capability', 'Verify the vendor VPN cut-off'],
        correctiveActionIds: ['01ABC'],
      },
    })
    expect(draft.constraints).toHaveLength(2)
    const brief = toBrief(draft)
    expect(brief.programProposal?.correctiveActionIds).toEqual(['01ABC'])
    expect(brief.constraints[0]).toContain('Cybersecurity')
  })

  it('ignores router state that is not a proposal', () => {
    expect(draftFromProposal(null)).toEqual(emptyDraft())
    expect(draftFromProposal({ programProposal: { constraints: 'x' } })).toEqual(emptyDraft())
  })
})

describe('brief start date (#426)', () => {
  const draft = { ...emptyDraft(), userPrompt: 'Ransomware on the baggage system' }

  it('is optional and sent only when set', () => {
    expect(toBrief(draft).startDate).toBeUndefined()
    expect(toBrief({ ...draft, startDate: '2026-03-12' }).startDate).toBe('2026-03-12')
  })

  it('must be a real calendar date', () => {
    expect(validateDraft({ ...draft, startDate: '2026-02-30' }).startDate).toBeTruthy()
    expect(validateDraft({ ...draft, startDate: '2026-03-12' }).startDate).toBeUndefined()
  })
})
