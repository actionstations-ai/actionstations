import { describe, expect, it } from 'vitest'
import { extractJson, jsonSpec } from './json'
import { MselPhaseOutput } from '@shared/schemas'

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }))
  it('prefers fenced blocks', () =>
    expect(extractJson('Here you go:\n```json\n{"rows":[1,2]}\n```\nThanks')).toEqual({
      rows: [1, 2],
    }))
  it('finds a balanced object inside prose, ignoring braces in strings', () =>
    expect(extractJson('Sure! {"msg":"a } b","n":2} — done')).toEqual({ msg: 'a } b', n: 2 }))
  it('returns undefined when nothing parses', () =>
    expect(extractJson('no json here')).toBeUndefined())
})

describe('jsonSpec', () => {
  it('emits a JSON Schema object for a stage output', () => {
    const spec = jsonSpec('MselPhaseOutput', MselPhaseOutput)
    expect(spec.name).toBe('MselPhaseOutput')
    expect(spec.schema.type).toBe('object')
    expect(JSON.stringify(spec.schema)).toContain('purposeTag')
  })
})
