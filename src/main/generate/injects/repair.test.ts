// Deterministic field repair (#175, #177.2) against the shipped template schemas, with the
// exact drafts the live runs produced.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { repairFields } from './repair'

const schemaOf = (type: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve('templates/injects', type, 'schema.json'), 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: false })
const valid = (type: string, fields: unknown): boolean => ajv.compile(schemaOf(type))(fields)

describe('repairFields', () => {
  it('radio_call background "outdoor" (#175) → the first enum value, with a note', () => {
    const fields: Record<string, unknown> = {
      channel: 'OPS 2',
      callsign: 'Patrol 4',
      lines: [{ from: 'Patrol 4', text: 'Dispatch, Patrol 4. Drone over the crest again.' }],
      background: 'outdoor',
    }
    expect(valid('radio_call', fields)).toBe(false)
    const repairs = repairFields(schemaOf('radio_call'), fields)
    expect(fields.background).toBe('ramp')
    expect(repairs).toEqual([
      {
        path: '/background',
        message: expect.stringMatching(/^"outdoor" is not one of "ramp" \| .*; set to "ramp"$/),
      },
    ])
    expect(valid('radio_call', fields)).toBe(true)
  })

  it('an enum value in the wrong case takes the matching option', () => {
    const fields: Record<string, unknown> = {
      channel: 'OPS 2',
      lines: [{ from: 'A', text: 'B' }],
      background: 'Vehicle',
    }
    repairFields(schemaOf('radio_call'), fields)
    expect(fields.background).toBe('vehicle')
  })

  it('the schema default wins over the first enum value when there is one', () => {
    const schema = {
      type: 'object',
      properties: { mood: { type: 'string', enum: ['calm', 'tense'], default: 'tense' } },
    }
    const fields: Record<string, unknown> = { mood: 'furious' }
    repairFields(schema, fields)
    expect(fields.mood).toBe('tense')
  })

  it('a 19-character tweet handle (#177.2) is cut to the 15 the pattern allows', () => {
    const fields: Record<string, unknown> = {
      displayName: 'Millbrook Water Watch',
      handle: '@MillbrookWaterWatch',
      text: 'Brown water on Elm St again. Anyone else? #Millbrook',
    }
    expect('MillbrookWaterWatch'.length).toBe(19)
    expect(valid('tweet', fields)).toBe(false)
    const repairs = repairFields(schemaOf('tweet'), fields)
    expect(fields.handle).toBe('MillbrookWaterW')
    expect(repairs[0]).toMatchObject({ path: '/handle' })
    expect(repairs[0]!.message).toMatch(/fitted to pattern/)
    expect(valid('tweet', fields)).toBe(true)
  })

  it('email_forward.original with an extra attachments key (#177.2): the key is dropped', () => {
    const fields: Record<string, unknown> = {
      fromName: 'Dana Ortiz',
      to: 'IT Service Desk',
      subject: 'FW: Invoice overdue',
      note: 'This looks off. Forwarding before anyone clicks.',
      original: {
        fromName: 'Accounts Receivable',
        subject: 'Invoice overdue',
        body: 'Please review the attached invoice.',
        attachments: ['invoice_1042.pdf'],
      },
    }
    expect(valid('email_forward', fields)).toBe(false)
    const repairs = repairFields(schemaOf('email_forward'), fields)
    expect(fields.original).not.toHaveProperty('attachments')
    expect(repairs).toEqual([
      { path: '/original/attachments', message: 'dropped "attachments" (not in the template)' },
    ])
    expect(valid('email_forward', fields)).toBe(true)
  })

  it('maxLength strings are truncated; valid fields are untouched', () => {
    const fields: Record<string, unknown> = {
      fromName: 'Dana Ortiz',
      senderInitials: 'DOXR',
      to: 'IT',
      subject: 'FW',
      note: 'n',
      original: { fromName: 'A', subject: 'B', body: 'C' },
    }
    const before = structuredClone(fields)
    const repairs = repairFields(schemaOf('email_forward'), fields)
    expect(fields.senderInitials).toBe('DOX')
    expect(repairs.map((r) => r.path)).toEqual(['/senderInitials'])
    expect({ ...fields, senderInitials: before.senderInitials }).toEqual(before)
  })

  it('walks array items and $ref definitions', () => {
    const schema = {
      type: 'object',
      $defs: {
        unit: {
          type: 'object',
          additionalProperties: false,
          properties: { state: { type: 'string', enum: ['on', 'off'] } },
        },
      },
      properties: { units: { type: 'array', items: { $ref: '#/$defs/unit' } } },
    }
    const fields: Record<string, unknown> = { units: [{ state: 'ON' }, { state: 'x', extra: 1 }] }
    const repairs = repairFields(schema, fields)
    expect(fields.units).toEqual([{ state: 'on' }, { state: 'on' }])
    expect(repairs.map((r) => r.path)).toEqual([
      '/units/0/state',
      '/units/1/extra',
      '/units/1/state',
    ])
  })

  it("'keys' mode only drops undeclared keys (values are left for the model's repair round)", () => {
    const fields: Record<string, unknown> = {
      channel: 'OPS 2',
      lines: [{ from: 'A', text: 'B', tone: 'calm' }],
      background: 'outdoor',
    }
    const repairs = repairFields(schemaOf('radio_call'), fields, 'keys')
    expect(repairs.map((r) => r.path)).toEqual(['/lines/0/tone'])
    expect(fields.background).toBe('outdoor')
  })

  it('leaves a value it cannot fix for validation to report', () => {
    const schema = {
      type: 'object',
      properties: { clock: { type: 'string', pattern: '^\\d{1,2}:\\d{2}$' } },
    }
    const fields: Record<string, unknown> = { clock: 'noon' }
    expect(repairFields(schema, fields)).toEqual([])
    expect(fields.clock).toBe('noon')
  })
})
