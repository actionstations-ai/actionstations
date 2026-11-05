import { describe, expect, it } from 'vitest'
import { CaseDataSettings } from './case-data'

describe('case data settings', () => {
  it('leaves the contact empty until the user sets one', () => {
    expect(CaseDataSettings.parse({}).contactEmail).toBe('')
  })
  it('accepts an email address or nothing and refuses anything else', () => {
    expect(CaseDataSettings.parse({ contactEmail: 'person@example.org' }).contactEmail).toBe(
      'person@example.org',
    )
    for (const bad of ['not an email', 'a@b', 'x <a@b.co>', 'a@b.co\nbcc: c@d.co'])
      expect(() => CaseDataSettings.parse({ contactEmail: bad }), bad).toThrow()
  })
})
