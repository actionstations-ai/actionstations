import { describe, expect, it } from 'vitest'
import { estimateFrameBytes } from '../codec'
import { IDS, NONCE, PAYLOAD_FIXTURES } from '../fixtures/payloads'
import { LIMITS, MESSAGE_TYPES, PLAINTEXT_TYPES, PROTOCOL_VERSION } from '../protocol'
import {
  Ciphertext,
  Destination,
  Envelope,
  EvalAssignPayload,
  HotwashItemPayload,
  CallAnswerPayload,
  EvalObservationPayload,
  PAYLOAD_SCHEMAS,
  VoteClosePayload,
  type Envelope as EnvelopeT,
} from './index'

const sealedPayload = { k: 's1', n: NONCE, c: 'AAAAAAAAAAAAAAAAAAAAAA' }

const envelope = (over: Partial<EnvelopeT> = {}): EnvelopeT => ({
  v: PROTOCOL_VERSION,
  session: IDS.session,
  seq: 1,
  from: IDS.playerA,
  to: 'controller',
  type: 'join',
  ts: 1_700_000_000_000,
  payload: sealedPayload,
  ...over,
})

describe('Envelope', () => {
  it('accepts a sealed frame and a plaintext server frame', () => {
    expect(Envelope.safeParse(envelope()).success).toBe(true)
    const server = envelope({
      from: 'server',
      seq: 0,
      to: `client:${IDS.playerA}`,
      type: 'presence',
      payload: PAYLOAD_FIXTURES.presence as Record<string, unknown>,
    })
    expect(Envelope.safeParse(server).success).toBe(true)
  })

  it('refuses an unknown top-level field (forward compatibility is through v)', () => {
    expect(Envelope.safeParse({ ...envelope(), extra: 1 }).success).toBe(false)
  })

  it('refuses another protocol version', () => {
    expect(Envelope.safeParse(envelope({ v: 2 as 1 })).success).toBe(false)
  })

  it('refuses a destination outside the grammar', () => {
    for (const bad of [
      'everyone',
      'role:',
      'role:has space',
      'client:short',
      'team:' + 'x'.repeat(129),
    ]) {
      expect(Destination.safeParse(bad).success, bad).toBe(false)
    }
    for (const good of [
      'all',
      'controller',
      'role:ops-director',
      'team:airside_1',
      `client:${IDS.playerA}`,
    ]) {
      expect(Destination.safeParse(good).success, good).toBe(true)
    }
  })

  it('refuses a signature of the wrong length and a malformed nonce', () => {
    expect(Envelope.safeParse(envelope({ sig: 'A'.repeat(85) })).success).toBe(false)
    expect(Envelope.safeParse(envelope({ sig: 'A'.repeat(86) })).success).toBe(true)
    expect(Ciphertext.safeParse({ ...sealedPayload, n: 'short' }).success).toBe(false)
    expect(Ciphertext.safeParse({ ...sealedPayload, k: 'x1' }).success).toBe(false)
    expect(Ciphertext.safeParse({ ...sealedPayload, k: 't12' }).success).toBe(true)
  })

  it('refuses a negative or fractional seq and a non-positive ts', () => {
    expect(Envelope.safeParse(envelope({ seq: -1 })).success).toBe(false)
    expect(Envelope.safeParse(envelope({ seq: 1.5 })).success).toBe(false)
    expect(Envelope.safeParse(envelope({ ts: 0 })).success).toBe(false)
  })
})

describe('payload schemas', () => {
  it('has a schema and a fixture for every message type', () => {
    for (const type of MESSAGE_TYPES) {
      expect(PAYLOAD_SCHEMAS[type], type).toBeDefined()
      expect(PAYLOAD_FIXTURES[type], type).toBeDefined()
    }
  })

  it.each(MESSAGE_TYPES)('%s accepts its fixture and refuses an unknown field', (type) => {
    const schema = PAYLOAD_SCHEMAS[type]
    expect(schema.safeParse(PAYLOAD_FIXTURES[type]).success).toBe(true)
    expect(
      schema.safeParse({ ...(PAYLOAD_FIXTURES[type] as object), unknownField: 1 }).success,
    ).toBe(false)
  })

  it('refuses an oversize text field', () => {
    const release = PAYLOAD_FIXTURES['inject.release']
    const big = { ...release, text: { ...release.text, body: 'x'.repeat(20_001) } }
    expect(PAYLOAD_SCHEMAS['inject.release'].safeParse(big).success).toBe(false)
    const notice = { ...PAYLOAD_FIXTURES['controller.notice'], text: 'x'.repeat(1_001) }
    expect(PAYLOAD_SCHEMAS['controller.notice'].safeParse(notice).success).toBe(false)
  })

  it('separates plaintext types from sealed ones', () => {
    for (const type of PLAINTEXT_TYPES)
      expect(type.startsWith('relay.') || type.startsWith('catchup.') || type === 'presence').toBe(
        true,
      )
    expect(PLAINTEXT_TYPES.has('join')).toBe(false)
  })

  it('hotwash.item may have empty text only as a +1 or a retraction', () => {
    const base = PAYLOAD_FIXTURES['hotwash.item']
    expect(HotwashItemPayload.safeParse({ ...base, text: '' }).success).toBe(false)
    expect(HotwashItemPayload.safeParse({ ...base, text: '', plusOneOf: IDS.item }).success).toBe(
      true,
    )
    expect(HotwashItemPayload.safeParse({ ...base, text: '', retractOf: IDS.item }).success).toBe(
      true,
    )
  })

  it('eval.observation of kind note needs no task; a task needs taskId and rating', () => {
    const base = PAYLOAD_FIXTURES['eval.observation']
    expect(
      EvalObservationPayload.safeParse({
        ...base,
        kind: 'note',
        taskId: undefined,
        rating: undefined,
      }).success,
    ).toBe(true)
    expect(EvalObservationPayload.safeParse({ ...base, rating: undefined }).success).toBe(false)
    expect(EvalObservationPayload.parse({ ...base, kind: undefined }).kind).toBe('task')
  })

  it('call.answer needs text or audio', () => {
    const { text: _text, ...none } = PAYLOAD_FIXTURES['call.answer']
    expect(CallAnswerPayload.safeParse(none).success).toBe(false)
    expect(CallAnswerPayload.safeParse({ ...none, text: 'ok' }).success).toBe(true)
  })

  it('vote.close.byRole refuses a per-ballot shape', () => {
    const base = PAYLOAD_FIXTURES['vote.close']
    expect(
      VoteClosePayload.safeParse({
        ...base,
        byRole: [{ roleId: 'pio', optionId: 'yes', count: 2 }],
      }).success,
    ).toBe(true)
    expect(
      VoteClosePayload.safeParse({ ...base, byRole: [{ client: IDS.playerA, optionId: 'yes' }] })
        .success,
    ).toBe(false)
  })

  it('an eval.assign of 120 tasks fits the relay 64 KiB cap at about 100-character tasks and 60-character headings; estimateFrameBytes says when it does not', () => {
    const base = PAYLOAD_FIXTURES['eval.assign']
    const task = base.tasks[0]!
    const tasks = (taskChars: number, headingChars: number) =>
      Array.from({ length: 120 }, (_, i) => ({
        ...task,
        id: `t${i}`,
        task: 'x'.repeat(taskChars),
        citation: {
          documentTitle: 'Airport Emergency Plan',
          headingPath: 'H'.repeat(headingChars),
          page: 12,
        },
        rowIds: ['I-01', 'I-02', 'I-03'],
      }))
    const realistic = EvalAssignPayload.safeParse({ ...base, tasks: tasks(100, 60) })
    expect(realistic.success).toBe(true)
    expect(estimateFrameBytes(realistic.data)).toBeLessThan(LIMITS.relay.envelopeBytes)
    // Every field at its cap does not fit: the controller truncates citations until it does (#416).
    const maximal = EvalAssignPayload.safeParse({ ...base, tasks: tasks(500, 300) })
    expect(maximal.success).toBe(true)
    expect(estimateFrameBytes(maximal.data)).toBeGreaterThan(LIMITS.relay.envelopeBytes)
  })
})
