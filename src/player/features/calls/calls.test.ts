import { describe, expect, it } from 'vitest'
import type { Opened } from '../../../shared/live/codec'
import type { SeatView } from '../../app/items'
import {
  applyEnd,
  applyRing,
  currentCall,
  encodeWav16k,
  markAnswered,
  maxRecordingSeconds,
  mayTakeCall,
  type CallMap,
} from './calls'

const ID = 'CCCCCCCCCCCCCCCCCCCCCC'
const ops: SeatView = { clientId: 'a'.repeat(22), kind: 'player', roleId: 'ops', teamId: 'ops' }

const ring = (over: Record<string, unknown> = {}, signedBy: 'host' | 'other' = 'host') =>
  ({
    type: 'call.ring',
    signedBy,
    payload: {
      callId: ID,
      turn: 1,
      persona: { name: 'Dana Whitlock', organization: 'Harbor Ledger' },
      transcript: 'Hello, Harbor Ledger here.',
      canSpeak: true,
      targets: ['role:ops'],
      ...over,
    },
  }) as unknown as Opened<'call.ring'>

describe('taking a call', () => {
  it('rings a player seat the call is for, and keeps the words as text', () => {
    const { calls, isNew } = applyRing({}, ring(), ops, 5)
    expect(isNew).toBe(true)
    expect(calls[ID]).toMatchObject({
      status: 'ringing',
      turn: 1,
      transcript: 'Hello, Harbor Ledger here.',
      history: [{ who: 'them', text: 'Hello, Harbor Ledger here.', turn: 1 }],
    })
  })

  it('ignores a ring that is not host-signed, not for this seat, or for evaluators', () => {
    expect(applyRing({}, ring({}, 'other'), ops, 5).calls).toEqual({})
    expect(applyRing({}, ring({ targets: ['role:it'] }), ops, 5).calls).toEqual({})
    expect(applyRing({}, ring(), { ...ops, kind: 'evaluator' }, 5).calls).toEqual({})
    expect(mayTakeCall({ targets: ['all'] }, ops)).toBe(true)
  })

  it('ignores a ring for a turn already heard, and adds the next turn to the same call', () => {
    const first = applyRing({}, ring(), ops, 5).calls
    expect(applyRing(first, ring(), ops, 6).calls).toBe(first)
    const answered = markAnswered(first, ID, 'Ops here.')
    const second = applyRing(answered, ring({ turn: 2, transcript: 'Good. A statement?' }), ops, 7)
    expect(second.isNew).toBe(false)
    expect(second.calls[ID]).toMatchObject({ status: 'ringing', turn: 2, openedAt: 5 })
    expect(second.calls[ID]!.history.map((l) => `${l.who}:${l.text}`)).toEqual([
      'them:Hello, Harbor Ledger here.',
      'me:Ops here.',
      'them:Good. A statement?',
    ])
  })

  it('waits for the caller after an answer, and an answer is only taken once per turn', () => {
    const first = applyRing({}, ring(), ops, 5).calls
    const a = markAnswered(first, ID, 'One')
    expect(a[ID]!.status).toBe('answered')
    expect(markAnswered(a, ID, 'Two')).toBe(a)
  })

  it('ends when the controller ends it, and not for a player-claimed end', () => {
    const calls = applyRing({}, ring(), ops, 5).calls
    const end = (by: string, signedBy: string) =>
      ({
        type: 'call.end',
        signedBy,
        payload: { callId: ID, turn: 1, reason: 'completed', by },
      }) as unknown as Opened<'call.end'>
    expect(applyEnd(calls, end('player', 'host'))).toBe(calls)
    expect(applyEnd(calls, end('controller', 'other'))).toBe(calls)
    expect(applyEnd(calls, end('controller', 'host'))[ID]).toMatchObject({
      status: 'ended',
      endedReason: 'completed',
    })
  })

  it('shows the most recent open call', () => {
    const a = applyRing({}, ring(), ops, 5).calls
    const b = applyRing(a, ring({ callId: 'DDDDDDDDDDDDDDDDDDDDDD' }), ops, 9).calls
    expect(currentCall(b)!.callId).toBe('DDDDDDDDDDDDDDDDDDDDDD')
    const ended: CallMap = {
      ...b,
      DDDDDDDDDDDDDDDDDDDDDD: { ...b.DDDDDDDDDDDDDDDDDDDDDD!, status: 'ended' },
    }
    expect(currentCall(ended)!.callId).toBe(ID)
  })
})

describe('recording limits and format', () => {
  it('allows 60 seconds on a 2 MiB connection and about 32 on 1 MiB', () => {
    expect(maxRecordingSeconds(2 * 1024 * 1024)).toBe(60)
    expect(maxRecordingSeconds(1024 * 1024)).toBe(32)
    expect(maxRecordingSeconds(10)).toBe(0)
  })

  it('writes a 16 kHz mono 16-bit PCM WAV with the right sizes', () => {
    const wav = encodeWav16k(new Float32Array([0, 1, -1, 0.5]))
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect(wav).toHaveLength(52)
    expect(view.getInt16(46, true)).toBe(32767)
    expect(view.getInt16(48, true)).toBe(-32768)
  })
})
