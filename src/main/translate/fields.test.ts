import { describe, expect, it } from 'vitest'
import {
  applyTranslation,
  extractTranslatable,
  mergeTranslated,
  translatableFields,
} from './fields'

const schema = {
  type: 'object',
  properties: {
    handle: { type: 'string', pattern: '^[A-Za-z0-9_]+$' },
    kind: { type: 'string', enum: ['photo', 'initials'] },
    displayName: { type: 'string', 'x-translate': false },
    sentAt: { type: 'string', format: 'date-time' },
    verified: { type: 'boolean' },
    likes: { type: 'number' },
    initials: { type: 'string', maxLength: 3 },
    text: { type: 'string', maxLength: 280 },
    contact: {
      type: 'object',
      properties: {
        name: { type: 'string', 'x-translate': false },
        note: { type: 'string' },
      },
    },
    bubbles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          timeLabel: { type: 'string', 'x-translate': false },
        },
      },
    },
    cc: { type: 'array', 'x-translate': false, items: { type: 'string' } },
  },
}

const fields = {
  handle: 'RiverbendWater',
  initials: 'RW',
  kind: 'photo',
  displayName: 'Riverbend Water',
  sentAt: '2027-03-04T10:42:00Z',
  verified: true,
  likes: 12,
  text: 'Boil water advisory for all of Zone 3.',
  contact: { name: 'Ana Ruiz', note: 'Call the hotline.' },
  bubbles: [
    { text: 'Is the water safe?', timeLabel: '10:42' },
    { text: 'Do not drink it.', timeLabel: '10:43' },
  ],
  cc: ['ops@example.org'],
}

describe('translatable fields (spec 0435 FR-3)', () => {
  it('keeps prose and drops enum, pattern, format, non-string and x-translate:false fields', () => {
    expect(translatableFields(schema, fields)).toEqual({
      text: 'Boil water advisory for all of Zone 3.',
      contact: { note: 'Call the hotline.' },
      bubbles: [{ text: 'Is the water safe?' }, { text: 'Do not drink it.' }],
    })
  })

  it('treats an array marked x-translate:false as a whole', () => {
    expect(extractTranslatable(schema.properties.cc, ['a'])).toBeUndefined()
  })

  it('skips empty strings and returns nothing when nothing is prose', () => {
    expect(extractTranslatable(schema.properties.text, '  ')).toBeUndefined()
    expect(
      translatableFields(
        { type: 'object', properties: { id: { type: 'string', pattern: 'x' } } },
        { id: 'x' },
      ),
    ).toEqual({})
  })

  it('merges translated text back and leaves every code untouched', () => {
    const merged = mergeTranslated(schema, fields, {
      handle: 'CHANGED',
      text: 'Aviso de hervir el agua para toda la Zona 3.',
      contact: { name: 'Otra Persona', note: 'Llame a la línea directa.' },
      bubbles: [{ text: '¿Es segura el agua?', timeLabel: '99:99' }, { text: 'No la beba.' }],
    }) as typeof fields
    expect(merged.handle).toBe('RiverbendWater')
    expect(merged.text).toBe('Aviso de hervir el agua para toda la Zona 3.')
    expect(merged.contact).toEqual({ name: 'Ana Ruiz', note: 'Llame a la línea directa.' })
    expect(merged.bubbles).toEqual([
      { text: '¿Es segura el agua?', timeLabel: '10:42' },
      { text: 'No la beba.', timeLabel: '10:43' },
    ])
    expect(merged.cc).toEqual(['ops@example.org'])
  })

  it('ignores extra keys, wrong shapes and non-string replies', () => {
    const merged = applyTranslation(schema, fields, {
      text: 42,
      invented: 'new field',
      bubbles: 'not a list',
    }) as Record<string, unknown>
    expect(merged.text).toBe(fields.text)
    expect(merged).not.toHaveProperty('invented')
    expect(merged.bubbles).toEqual(fields.bubbles)
  })

  it('returns the English fields when there is no translation', () => {
    expect(applyTranslation(schema, fields, undefined)).toBe(fields)
  })
})
