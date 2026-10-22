import { describe, expect, it } from 'vitest'
import type { JsonSchema } from './fields'
import { diffFields, showValue } from './diff'
import { remapFields } from './remap'

const schemas = import.meta.glob<JsonSchema>('../../../../../../templates/injects/*/schema.json', {
  eager: true,
  import: 'default',
})
const schema = (type: string) =>
  Object.entries(schemas).find(([p]) => p.includes(`/${type}/schema.json`))![1]

describe('remapFields (type switch)', () => {
  it('keeps same-name fields, renames synonyms and reports what is dropped', () => {
    const ticket = {
      ticketNo: '4492',
      priority: 'Low',
      subject: 'Vending machines',
      description: 'The Coke machines spit out all their cans.',
      status: 'Open',
    }
    const r = remapFields(ticket, schema('tweet'))
    expect(r.fields).toEqual({ text: 'The Coke machines spit out all their cans.' })
    expect(r.renamed).toEqual({ text: 'description' })
    expect(r.dropped.sort()).toEqual(['priority', 'status', 'subject', 'ticketNo'])
  })

  it('drops a same-name field whose value has the wrong type for the target', () => {
    const r = remapFields({ rows: 'not a list', clock: '10:15' }, schema('fids_board'))
    expect(r.fields).toEqual({ clock: '10:15' })
    expect(r.dropped).toEqual(['rows'])
  })

  it('drops enum values the target does not allow', () => {
    const r = remapFields({ avatarStyle: 'cartoon', handle: 'x' }, schema('tweet'))
    expect(r.fields).toEqual({ handle: 'x' })
    expect(r.dropped).toEqual(['avatarStyle'])
  })

  it('round-trips a tweet onto a facebook post without losing the shared fields', () => {
    const tweet = { displayName: 'Travel Guy', text: 'Boards are wrong #NCIA', timestampRel: '4m' }
    const r = remapFields(tweet, schema('facebook_post'))
    expect(r.dropped).not.toContain('text')
  })
})

describe('diffFields', () => {
  it('lists added, changed and removed leaves with readable paths', () => {
    const before = { text: 'a', rows: [{ gate: 'A1' }, { gate: 'A2' }], old: true }
    const after = { text: 'b', rows: [{ gate: 'A1' }, { gate: 'Z99' }], extra: 1 }
    expect(diffFields(before, after)).toEqual([
      { path: 'text', kind: 'changed', before: 'a', after: 'b' },
      { path: 'rows[1].gate', kind: 'changed', before: 'A2', after: 'Z99' },
      { path: 'extra', kind: 'added', after: 1 },
      { path: 'old', kind: 'removed', before: true },
    ])
    expect(diffFields(after, after)).toEqual([])
  })

  it('shortens long values for display', () => {
    expect(showValue('x'.repeat(300), 10)).toHaveLength(10)
    expect(showValue({ a: 1 })).toBe('{"a":1}')
  })
})
