import { describe, expect, it } from 'vitest'
import { encodeFrame, open, seal } from './codec'
import { IDS, PAYLOAD_FIXTURES } from './fixtures/payloads'
import { keysFromInvite, makeController } from './fixtures/setup'
import { LIMITS, PROTOCOL_VERSION } from './protocol'
import { ReplayGuard } from './replay'
import { PAYLOAD_SCHEMAS } from './schemas'
import type { EnvelopeHeader } from './schemas'
import { DECISION_LIMITS, type DecisionForm } from '../schemas/decisions'

const header = <T extends 'decision.form' | 'decision.submit'>(
  type: T,
  over: Partial<Omit<EnvelopeHeader, 'type'>> = {},
): EnvelopeHeader & { type: T } => ({
  v: PROTOCOL_VERSION,
  session: IDS.session,
  seq: 1,
  from: IDS.playerA,
  to: 'controller',
  ts: 1_700_000_000_000,
  ...over,
  type,
})

async function setup() {
  const ctl = await makeController()
  const playerKeys = await keysFromInvite(ctl, 'players')
  const staffKeys = await keysFromInvite(ctl, 'staff')
  const base = { crypto: ctl.crypto, controllerPub: ctl.controllerPub }
  return {
    ctl,
    playerKeys,
    controller: { ...base, keys: ctl.keys },
    player: { ...base, keys: playerKeys },
    staff: { ...base, keys: staffKeys },
  }
}

const submit = (over: Record<string, unknown> = {}) => ({
  ...PAYLOAD_FIXTURES['decision.submit'],
  ...over,
})

describe('decision.submit', () => {
  it('is sealed to the controller: players and staff cannot read it', async () => {
    const t = await setup()
    const env = await seal(
      t.ctl.crypto,
      t.playerKeys,
      header('decision.submit'),
      PAYLOAD_FIXTURES['decision.submit'],
    )
    expect(env.payload).toMatchObject({ k: 'c' })
    expect((await open(encodeFrame(env), t.controller)).ok).toBe(true)
    for (const ctx of [t.player, t.staff]) {
      expect(await open(encodeFrame(env), ctx)).toMatchObject({
        ok: false,
        reason: 'CONTROLLER_ONLY',
      })
    }
  })

  it('carries no controller signature (the device is known by its sealed channel)', async () => {
    const t = await setup()
    const env = await seal(
      t.ctl.crypto,
      t.playerKeys,
      header('decision.submit'),
      PAYLOAD_FIXTURES['decision.submit'],
    )
    expect(env.sig).toBeUndefined()
  })

  it('a replayed frame, and an older one from the same device, are dropped', async () => {
    const t = await setup()
    const guard = new ReplayGuard()
    const ctx = { ...t.controller, replay: guard }
    const make = (seq: number) =>
      seal(t.ctl.crypto, t.playerKeys, header('decision.submit', { seq }), submit())
    const two = await make(2)
    const one = await make(1)
    expect((await open(encodeFrame(two), ctx)).ok).toBe(true)
    expect(await open(encodeFrame(two), ctx)).toMatchObject({ ok: false, reason: 'REPLAY' })
    expect(await open(encodeFrame(one), ctx)).toMatchObject({ ok: false, reason: 'REPLAY' })
    expect(guard.dropped).toBe(2)
  })

  it('refuses a payload with an unknown field, a bad id or a bad area', () => {
    const schema = PAYLOAD_SCHEMAS['decision.submit']
    expect(schema.safeParse(submit()).success).toBe(true)
    expect(schema.safeParse(submit({ extra: 1 })).success).toBe(false)
    expect(schema.safeParse(submit({ decisionId: 'short' })).success).toBe(false)
    expect(schema.safeParse(submit({ area: { polygon: [{ lat: 1, lon: 1 }] } })).success).toBe(
      false,
    )
    expect(schema.safeParse(submit({ area: { areaId: 'harbor', polygon: [] } })).success).toBe(
      false,
    )
  })

  it('refuses more fields than a form can have and text over the limit', () => {
    const schema = PAYLOAD_SCHEMAS['decision.submit']
    const many = Array.from({ length: DECISION_LIMITS.fields + 1 }, (_, i) => ({
      fieldId: `f${i}`,
      value: 'x',
    }))
    expect(schema.safeParse(submit({ fields: many })).success).toBe(false)
    const long = [{ fieldId: 'note', value: 'x'.repeat(DECISION_LIMITS.textMax + 1) }]
    expect(schema.safeParse(submit({ fields: long })).success).toBe(false)
  })

  it('the largest valid submission still fits one relay frame', async () => {
    const t = await setup()
    const fields = Array.from({ length: DECISION_LIMITS.fields }, (_, i) => ({
      fieldId: `field-${i}`,
      value: 'x'.repeat(DECISION_LIMITS.textMax),
    }))
    const polygon = Array.from({ length: DECISION_LIMITS.polygonPoints }, (_, i) => ({
      lat: 40.123456789 + i,
      lon: -73.123456789 - i,
    }))
    const env = await seal(
      t.ctl.crypto,
      t.playerKeys,
      header('decision.submit'),
      submit({ fields, area: { polygon } }),
    )
    expect(encodeFrame(env).length).toBeLessThan(LIMITS.relay.envelopeBytes)
  })
})

describe('decision.form', () => {
  const frame = async (t: Awaited<ReturnType<typeof setup>>, signed: boolean) =>
    seal(
      t.ctl.crypto,
      t.ctl.keys,
      header('decision.form', { from: IDS.controller, to: `client:${IDS.playerA}` }),
      PAYLOAD_FIXTURES['decision.form'],
      signed ? { signer: t.ctl.signing.privateKey } : {},
    )

  it('needs the controller signature', async () => {
    const t = await setup()
    await expect(frame(t, false)).rejects.toMatchObject({ code: 'NO_SIGNER' })
    const env = await frame(t, true)
    const opened = await open(encodeFrame(env), t.player)
    expect(opened.ok && opened.msg.signedBy).toBe('host')
  })

  it('is addressed to one device: a form sent to everyone or to a role is refused', async () => {
    const t = await setup()
    for (const to of ['all', 'role:pio'] as const) {
      await expect(
        seal(
          t.ctl.crypto,
          t.ctl.keys,
          header('decision.form', { from: IDS.controller, to }),
          PAYLOAD_FIXTURES['decision.form'],
          { signer: t.ctl.signing.privateKey },
        ),
      ).rejects.toBeDefined()
    }
  })

  it('an unsigned copy is refused by a player', async () => {
    const t = await setup()
    const { sig: _sig, ...unsigned } = await frame(t, true)
    expect(await open(JSON.stringify(unsigned), t.player)).toMatchObject({
      ok: false,
      reason: 'UNSIGNED_CONTROLLER_MESSAGE',
    })
  })

  it('the largest valid form still fits one relay frame', async () => {
    const t = await setup()
    const name = (i: number) => ({ id: `option-${'x'.repeat(40)}-${i}`, label: 'L'.repeat(80) })
    const form: DecisionForm = {
      id: 'big',
      title: 'T'.repeat(120),
      description: 'D'.repeat(300),
      seats: Array.from({ length: 64 }, (_, i) => `role-${'r'.repeat(100)}-${i}`),
      fields: [
        ...Array.from({ length: DECISION_LIMITS.fields - 1 }, (_, i) => ({
          id: `choice-${i}`,
          type: 'choice' as const,
          label: 'F'.repeat(120),
          help: 'H'.repeat(240),
          required: true,
          options: Array.from({ length: DECISION_LIMITS.options }, (_, j) => name(j)),
        })),
        {
          id: 'where',
          type: 'area' as const,
          label: 'A'.repeat(120),
          required: true,
          draw: true,
          areas: Array.from({ length: DECISION_LIMITS.areas }, (_, j) => name(j)),
        },
      ],
    }
    expect(PAYLOAD_SCHEMAS['decision.form'].safeParse({ form }).success).toBe(true)
    const env = await seal(
      t.ctl.crypto,
      t.ctl.keys,
      header('decision.form', { from: IDS.controller, to: `client:${IDS.playerA}` }),
      { form },
      { signer: t.ctl.signing.privateKey },
    )
    expect(encodeFrame(env).length).toBeLessThan(LIMITS.relay.envelopeBytes)
  })
})
