import { describe, expect, it } from 'vitest'
import type { Inject } from '@shared/schemas'
import { callFromRow, isCallInject } from './inject-call'

const roles = [
  { id: 'ops', team: 'Operations' },
  { id: 'pio', team: 'Communications' },
]

const row = (over: Record<string, unknown> = {}) => ({
  id: 'I-07',
  from: 'Dana Reyes, Channel 5',
  event: 'A reporter asks about the terminal',
  toRoleIds: ['pio'],
  ...over,
})

const phone = (over: Record<string, unknown> = {}) =>
  ({
    id: 'inj-7',
    mselRowId: 'I-07',
    type: 'phone_call',
    title: 'Reporter',
    deliveryMode: 'read_aloud',
    mediaBrief: {
      voiceLines: [
        { speaker: 'Reporter', voiceStyle: '', text: 'Is the terminal closed?' },
        { speaker: 'Reporter', voiceStyle: '', text: 'We are going live in ten minutes.' },
      ],
    },
    ...over,
  }) as unknown as Inject

describe('callFromRow', () => {
  it('speaks the voice lines as the party the row is from, to the roles it names', () => {
    expect(callFromRow(row(), phone(), roles)).toEqual({
      targets: ['role:pio'],
      persona: { name: 'Dana Reyes, Channel 5' },
      transcript: 'Is the terminal closed? We are going live in ten minutes.',
      injectId: 'inj-7',
      mselRowId: 'I-07',
    })
  })

  it('falls back to the row event and to a generic caller', () => {
    const call = callFromRow(row({ from: ' ' }), undefined, roles)
    expect(call.persona.name).toBe('Caller')
    expect(call.transcript).toBe('A reporter asks about the terminal')
    expect(call).not.toHaveProperty('injectId')
  })

  it('rings everyone for a row addressed to all', () => {
    expect(callFromRow(row({ toLabel: 'All', toRoleIds: [] }), phone(), roles).targets).toEqual([
      'all',
    ])
  })

  it('knows which inject types play as a call', () => {
    expect(isCallInject(phone())).toBe(true)
    expect(isCallInject(phone({ type: 'radio_call' }))).toBe(true)
    expect(isCallInject(phone({ type: 'memo' }))).toBe(false)
    expect(isCallInject(undefined)).toBe(false)
  })
})
