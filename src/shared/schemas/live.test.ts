import { describe, expect, it } from 'vitest'
import { LogRef } from './live'

describe('LogRef ids (#413)', () => {
  it('accepts protocol ids that start with "-" or "_", and app ids', () => {
    for (const id of [
      '-abcdefghijklmnopqrstu',
      '_abcdefghijklmnopqrstu',
      '01JC9Z5X8Q7W3M2N4B6V8C0D1E',
    ])
      expect(LogRef.safeParse({ messageId: id, voteId: id, releaseId: id }).success).toBe(true)
  })
  it('still refuses path-like or empty ids', () => {
    for (const id of ['../x', 'a/b', '', 'a b'])
      expect(LogRef.safeParse({ messageId: id }).success).toBe(false)
  })
})
