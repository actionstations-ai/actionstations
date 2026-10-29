import { describe, expect, it, vi } from 'vitest'
import type { BlobRef } from '@shared/live/schemas'
import { Calls, type AnsweredTurn, type CallsDeps, type CallSeat } from './calls'

const OPS: CallSeat = { clientId: 'c'.repeat(22), kind: 'player', roleId: 'ops', label: 'Ops' }
const IT: CallSeat = { clientId: 'd'.repeat(22), kind: 'player', roleId: 'it', label: 'IT' }
const EVAL: CallSeat = { clientId: 'e'.repeat(22), kind: 'evaluator', label: 'Evaluator' }
const seats = new Map([OPS, IT, EVAL].map((s) => [s.clientId, s]))

const audioRef = (bytes: number, kind: BlobRef['kind'] = 'audio'): BlobRef => ({
  blobId: 'b'.repeat(22),
  kind,
  mime: 'audio/wav',
  bytes,
  sha256: 'a'.repeat(64),
  k: 's1',
  n: 'n'.repeat(16),
})

function setup() {
  const sent: { type: string; to: string; payload: Record<string, unknown> }[] = []
  const logged: { kind: string; data: Record<string, unknown> }[] = []
  const answers: AnsweredTurn[] = []
  const ended: string[] = []
  let n = 0
  const deps: CallsDeps = {
    send: async (type, to, payload) => void sent.push({ type, to, payload }),
    putBlob: async (_meta, bytes) => audioRef(bytes.length),
    getBlob: async () => new Uint8Array(1500),
    log: { append: async (i) => void logged.push(i as never) },
    seatOf: (id) => seats.get(id),
    clientRef: async (id) => id.slice(0, 8),
    clock: async () => '1:05',
    maxAnswerBytes: () => 1024 * 1024,
    newId: () => `call${String(++n).padStart(18, '0')}`,
    answered: (a) => void answers.push(a),
    ended: (id) => void ended.push(id),
    changed: vi.fn(),
  }
  return { calls: new Calls(deps), sent, logged, answers, ended, deps }
}

const persona = { name: 'Dana Whitlock', organization: 'Harbor Ledger' }

describe('voice calls', () => {
  it('rings each target with the line as text and as audio', async () => {
    const t = setup()
    const r = await t.calls.ring({
      targets: ['role:ops', 'role:it'],
      persona,
      transcript: 'Hello, Harbor Ledger here.',
      audio: { bytes: new Uint8Array(900), mime: 'audio/wav', durationSec: 2 },
      canSpeak: true,
      personaId: 'p1',
    })
    expect(r.turn).toBe(1)
    expect(t.sent.map((s) => [s.type, s.to])).toEqual([
      ['call.ring', 'role:ops'],
      ['call.ring', 'role:it'],
    ])
    expect(t.sent[0]!.payload).toMatchObject({
      callId: r.callId,
      turn: 1,
      transcript: 'Hello, Harbor Ledger here.',
      canSpeak: true,
      persona: { name: 'Dana Whitlock', organization: 'Harbor Ledger' },
      audio: { kind: 'audio', bytes: 900 },
    })
    expect(t.logged[0]).toMatchObject({ kind: 'call.ring', data: { turn: 1 } })
  })

  it('takes an answer from a seat the call was for, once per turn', async () => {
    const t = setup()
    const { callId } = await t.calls.ring({
      targets: ['role:ops'],
      persona,
      transcript: 'Hi',
      canSpeak: false,
      personaId: 'p1',
    })
    await t.calls.onAnswer(OPS.clientId, 1, { callId, turn: 1, text: 'Ops here.' })
    await t.calls.onAnswer(OPS.clientId, 2, { callId, turn: 1, text: 'Again.' })
    expect(t.answers).toEqual([
      { callId, turn: 1, personaId: 'p1', seatLabel: 'Ops', roleId: 'ops', text: 'Ops here.' },
    ])
    expect(t.logged.filter((l) => l.kind === 'anomaly')).toHaveLength(1)
  })

  it('refuses answers from other seats, evaluators, old turns and unknown calls', async () => {
    const t = setup()
    const { callId } = await t.calls.ring({
      targets: ['role:ops'],
      persona,
      transcript: 'Hi',
      canSpeak: false,
    })
    await t.calls.onAnswer(IT.clientId, 1, { callId, turn: 1, text: 'Not for IT.' })
    await t.calls.onAnswer(EVAL.clientId, 2, { callId, turn: 1, text: 'Evaluator.' })
    await t.calls.onAnswer(OPS.clientId, 3, { callId, turn: 7, text: 'Wrong turn.' })
    await t.calls.onAnswer(OPS.clientId, 4, { callId: 'z'.repeat(22), turn: 1, text: 'No call.' })
    expect(t.answers).toEqual([])
    expect(t.logged.filter((l) => l.kind === 'anomaly')).toHaveLength(4)
  })

  it('fetches a spoken answer, and refuses one that is too large or not audio', async () => {
    const t = setup()
    const { callId } = await t.calls.ring({
      targets: ['role:ops'],
      persona,
      transcript: 'Hi',
      canSpeak: true,
    })
    await t.calls.onAnswer(OPS.clientId, 1, { callId, turn: 1, audio: audioRef(2 * 1024 * 1024) })
    expect(t.answers).toEqual([])
    await t.calls.onAnswer(OPS.clientId, 2, { callId, turn: 1, audio: audioRef(1500, 'image') })
    expect(t.answers).toEqual([])
    await t.calls.onAnswer(OPS.clientId, 3, { callId, turn: 1, audio: audioRef(1500) })
    expect(t.answers[0]!.audio).toHaveLength(1500)
    expect(t.logged.find((l) => l.kind === 'call.answer')!.data).toMatchObject({ audioBytes: 1500 })
    expect(JSON.stringify(t.logged)).not.toContain('"audio":{')
  })

  it('continues the same call with the next turn, and only an open turn can be answered', async () => {
    const t = setup()
    const first = await t.calls.ring({
      targets: ['role:ops'],
      persona,
      transcript: 'One',
      canSpeak: false,
    })
    await t.calls.onAnswer(OPS.clientId, 1, { callId: first.callId, turn: 1, text: 'Reply' })
    const next = await t.calls.ring({
      callId: first.callId,
      targets: ['role:ops'],
      persona,
      transcript: 'Two',
      canSpeak: false,
    })
    expect(next).toEqual({ callId: first.callId, turn: 2 })
    await t.calls.onAnswer(OPS.clientId, 2, { callId: first.callId, turn: 2, text: 'Reply 2' })
    expect(t.answers.map((a) => a.turn)).toEqual([1, 2])
  })

  it('ends when the controller or the player hangs up, and then takes no more answers', async () => {
    const t = setup()
    const a = await t.calls.ring({
      targets: ['role:ops'],
      persona,
      transcript: 'Hi',
      canSpeak: false,
    })
    await t.calls.onPlayerEnd(OPS.clientId, 1, {
      callId: a.callId,
      turn: 1,
      reason: 'hangup',
      by: 'player',
    })
    expect(t.ended).toEqual([a.callId])
    await t.calls.onAnswer(OPS.clientId, 2, { callId: a.callId, turn: 1, text: 'Late' })
    expect(t.answers).toEqual([])
    await expect(
      t.calls.ring({
        callId: a.callId,
        targets: ['role:ops'],
        persona,
        transcript: 'x',
        canSpeak: false,
      }),
    ).rejects.toThrow(/ended/)

    const b = await t.calls.ring({
      targets: ['role:ops'],
      persona,
      transcript: 'Hi',
      canSpeak: false,
    })
    await t.calls.end(b.callId)
    expect(t.sent.at(-1)).toMatchObject({
      type: 'call.end',
      payload: { by: 'controller', reason: 'completed' },
    })
  })

  it('does not let a player end a call it was not part of', async () => {
    const t = setup()
    const a = await t.calls.ring({
      targets: ['role:ops'],
      persona,
      transcript: 'Hi',
      canSpeak: false,
    })
    await t.calls.onPlayerEnd(IT.clientId, 1, {
      callId: a.callId,
      turn: 1,
      reason: 'hangup',
      by: 'player',
    })
    expect(t.ended).toEqual([])
    expect(t.calls.get(a.callId)!.status).toBe('ringing')
  })
})
