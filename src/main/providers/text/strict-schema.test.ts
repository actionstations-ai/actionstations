import { describe, expect, it } from 'vitest'
import { InjectTextOutput, MselPhaseOutput } from '@shared/schemas'
import { jsonSpec } from '../json'
import { ANTHROPIC_UNSUPPORTED, restoreOptionals, toStrictSchema } from './strict-schema'

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe('toStrictSchema', () => {
  const msel = jsonSpec('MselPhaseOutput', MselPhaseOutput).schema

  it('closes every object and requires every property', () => {
    const { schema, strict } = toStrictSchema(msel)
    const row = (schema as J).properties.rows.items
    expect(strict).toBe(true)
    expect(row.additionalProperties).toBe(false)
    expect(row.required).toContain('wallClock')
    expect(row.properties.wallClock).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] })
  })

  it('marks schemas with open maps (z.record) as non-strict', () => {
    const { schema, strict } = toStrictSchema(jsonSpec('I', InjectTextOutput).schema)
    expect(strict).toBe(false)
    expect((schema as J).properties.fields.additionalProperties).toEqual({})
    // zod emits propertyNames for z.record; LM Studio's grammar compiler rejects it.
    expect((schema as J).properties.fields.propertyNames).toBeUndefined()
    expect(JSON.stringify(schema)).not.toContain('propertyNames')
  })

  it('drops keywords Anthropic cannot enforce and clamps minItems', () => {
    const { schema } = toStrictSchema(
      {
        type: 'object',
        properties: {
          a: {
            type: 'array',
            minItems: 3,
            maxItems: 9,
            items: { type: 'string', pattern: 'x', minLength: 2 },
          },
        },
        required: ['a'],
      },
      { dropKeywords: ANTHROPIC_UNSUPPORTED },
    )
    expect((schema as J).properties.a).toEqual({
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    })
  })

  it('does not mutate the input schema', () => {
    const before = JSON.stringify(msel)
    toStrictSchema(msel, { dropKeywords: ANTHROPIC_UNSUPPORTED })
    expect(JSON.stringify(msel)).toBe(before)
  })
})

describe('restoreOptionals', () => {
  it('removes nulls only where the original schema made the field optional', () => {
    const schema = jsonSpec('MselPhaseOutput', MselPhaseOutput).schema
    const value = {
      rows: [
        {
          id: 'START',
          time: 'T+0',
          wallClock: null,
          from: 'SimCell',
          to: ['all'],
          event: 'e',
          expectedAction: 'a',
          purposeTag: 'STARTEX',
          format: 'briefing',
          citations: [],
        },
      ],
    }
    const restored = restoreOptionals(value, schema) as J
    expect('wallClock' in restored.rows[0]).toBe(false)
    expect(MselPhaseOutput.safeParse(restored).success).toBe(true)
  })

  it('follows $ref into $defs', () => {
    const schema = {
      type: 'object',
      properties: { item: { $ref: '#/$defs/Item' } },
      required: ['item'],
      $defs: { Item: { type: 'object', properties: { note: { type: 'string' } }, required: [] } },
    }
    expect(restoreOptionals({ item: { note: null } }, schema)).toEqual({ item: {} })
  })
})
