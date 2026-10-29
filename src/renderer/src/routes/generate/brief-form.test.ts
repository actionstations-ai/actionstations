import { describe, expect, it } from 'vitest'
import { emptyDraft, toBrief, validateDraft } from './brief-form'

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
