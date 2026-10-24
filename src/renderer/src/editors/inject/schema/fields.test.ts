import { describe, expect, it } from 'vitest'
import {
  emptyValue,
  formFromSchema,
  humanize,
  type FieldSpec,
  type JsonSchema,
  type ObjectField,
} from './fields'
import { validateFields } from './validate'

// Every real template schema and preview, read at build time (no Node fs in renderer code).
const schemas = import.meta.glob<JsonSchema>('../../../../../../templates/injects/*/schema.json', {
  eager: true,
  import: 'default',
})
const previews = import.meta.glob<{
  fields: Record<string, unknown>
  variants?: Record<string, { fields: Record<string, unknown> }>
}>('../../../../../../templates/injects/*/preview.json', { eager: true, import: 'default' })
const typeOf = (p: string) => p.split('/').at(-2)!
const SCHEMAS = Object.fromEntries(Object.entries(schemas).map(([p, s]) => [typeOf(p), s]))
const PREVIEWS = Object.fromEntries(Object.entries(previews).map(([p, s]) => [typeOf(p), s]))

const form = (type: string) => formFromSchema(SCHEMAS[type]!)
const field = (parent: ObjectField, name: string): FieldSpec => {
  const f = parent.fields.find((x) => x.name === name)
  if (!f) throw new Error(`no field ${name}`)
  return f
}

describe('formFromSchema on real templates', () => {
  it('finds every template schema', () => {
    expect(Object.keys(SCHEMAS).length).toBeGreaterThanOrEqual(40)
  })

  it('tweet: required inputs, long text as textarea, enums, nested metrics fieldset', () => {
    const f = form('tweet')
    expect(field(f, 'handle')).toMatchObject({ kind: 'string', widget: 'input', required: true })
    expect(field(f, 'text')).toMatchObject({ kind: 'string', widget: 'textarea', maxLength: 560 })
    expect(field(f, 'avatarStyle')).toMatchObject({
      kind: 'enum',
      options: ['photo', 'initials', 'default'],
    })
    expect(field(f, 'verified')).toMatchObject({ kind: 'boolean', required: false })
    const metrics = field(f, 'metrics') as ObjectField
    expect(metrics.kind).toBe('object')
    expect(field(metrics, 'likes')).toMatchObject({ kind: 'number', integer: true, minimum: 0 })
    expect(field(f, 'displayName').description).toMatch(/display name/i)
  })

  it('fids_board: rows become a tabular row editor with limits', () => {
    const rows = field(form('fids_board'), 'rows')
    expect(rows).toMatchObject({ kind: 'object-list', minItems: 1, maxItems: 14, tabular: true })
    if (rows.kind !== 'object-list') throw new Error()
    expect(rows.item.fields.map((x) => x.name)).toEqual([
      'time',
      'dest',
      'flight',
      'airline',
      'gate',
      'status',
      'remarks',
      'anomaly',
    ])
    expect(emptyValue(rows.item)).toEqual({ flight: '', dest: '', time: '', status: '' })
  })

  it('chat_transcript: participants list of strings and messages row editor', () => {
    const f = form('chat_transcript')
    expect(field(f, 'participants').kind).toBe('string-list')
    expect(field(f, 'messages').kind).toBe('object-list')
  })

  it('radio_call: transmission lines are an object list', () => {
    const lists = form('radio_call').fields.filter((x) => x.kind === 'object-list')
    expect(lists.length).toBeGreaterThan(0)
  })

  it('facebook_post: array of enum strings becomes a checkbox group', () => {
    expect(field(form('facebook_post'), 'reactionTypes')).toMatchObject({ kind: 'enum-list' })
  })

  it('instagram_post: integer-or-string likes is a number-or-text field', () => {
    expect(field(form('instagram_post'), 'likes').kind).toBe('number-or-text')
  })

  it('ics_201_prefill: $ref to $defs resolves into a real list', () => {
    const f = form('ics_201_prefill')
    const units = JSON.stringify(f).includes('"name":"operationsUnits","label"')
    expect(units).toBe(true)
    const walk = (x: FieldSpec): FieldSpec[] =>
      x.kind === 'object'
        ? x.fields.flatMap(walk)
        : x.kind === 'object-list'
          ? [x, ...walk(x.item)]
          : [x]
    const ops = walk(f).find((x) => x.name === 'operationsUnits')
    expect(ops?.kind).not.toBe('unknown')
  })

  it('email, memo, system_log, helpdesk_ticket, sitrep: no unknown fields anywhere', () => {
    const walk = (x: FieldSpec): FieldSpec[] =>
      x.kind === 'object'
        ? x.fields.flatMap(walk)
        : x.kind === 'object-list'
          ? [x, ...walk(x.item)]
          : [x]
    for (const type of ['email', 'memo', 'system_log', 'helpdesk_ticket', 'sitrep', 'radio_call'])
      expect(
        walk(form(type)).filter((x) => x.kind === 'unknown'),
        type,
      ).toEqual([])
  })

  it('labels come from titles or humanized names', () => {
    expect(humanize('boardTitle')).toBe('Board title')
    expect(humanize('ics_201')).toBe('Ics 201')
    expect(humanize('flightID')).toBe('Flight id')
  })
})

describe('validateFields mirrors the template contract', () => {
  it('every template preview.json validates cleanly', () => {
    const failures = Object.keys(SCHEMAS)
      .filter((t) => PREVIEWS[t])
      .map((t) => [t, validateFields(SCHEMAS[t]!, PREVIEWS[t]!.fields)] as const)
      .filter(([, issues]) => issues.length)
    expect(failures).toEqual([])
  })

  it('every per-variant preview (preview.json variants) validates cleanly', () => {
    const failures = Object.keys(SCHEMAS)
      .flatMap((t) =>
        Object.entries(PREVIEWS[t]?.variants ?? {}).map(([v, over]) => [
          `${t}--${v}`,
          validateFields(SCHEMAS[t]!, { ...PREVIEWS[t]!.fields, ...over.fields }),
        ]),
      )
      .filter(([, issues]) => issues!.length)
    expect(failures).toEqual([])
  })

  it('reports required, pattern, length, enum, type and unknown keys with paths', () => {
    const issues = validateFields(SCHEMAS.tweet!, {
      handle: 'not a handle!',
      text: 'x'.repeat(600),
      avatarStyle: 'cartoon',
      metrics: { likes: -1 },
      verified: 'yes',
      nonsense: 1,
    })
    const byPath = Object.fromEntries(issues.map((i) => [i.path, i.message]))
    expect(byPath['/displayName']).toBe('Required')
    expect(byPath['/handle']).toMatch(/format/)
    expect(byPath['/text']).toMatch(/At most 560/)
    expect(byPath['/avatarStyle']).toMatch(/One of/)
    expect(byPath['/metrics/likes']).toMatch(/≥ 0/)
    expect(byPath['/verified']).toMatch(/yes\/no/)
    expect(byPath['/nonsense']).toMatch(/Not a field/)
  })

  it('checks array items and limits (fids rows)', () => {
    const issues = validateFields(SCHEMAS.fids_board!, { rows: [{ flight: 'DL 1' }] })
    expect(issues.map((i) => i.path).sort()).toEqual([
      '/rows/0/dest',
      '/rows/0/status',
      '/rows/0/time',
    ])
    expect(validateFields(SCHEMAS.fids_board!, { rows: [] })[0]?.message).toMatch(/at least 1/)
  })
})
