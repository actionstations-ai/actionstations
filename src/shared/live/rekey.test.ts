import { describe, expect, it } from 'vitest'
import { bytesEqual, toBase64Url, toHex } from './bytes'
import { encodeFrame, open, seal, type Opened } from './codec'
import { SessionKeys } from './crypto/keys'
import { createNobleProvider } from './crypto/noble'
import type { CryptoProvider } from './crypto/provider'
import { createWebCryptoProvider } from './crypto/webcrypto'
import { IDS, PAYLOAD_FIXTURES } from './fixtures/payloads'
import { keysFromInvite, makeController, type Controller } from './fixtures/setup'
import { parseInvite } from './invite'
import { buildJoin, verifyJoin } from './join'
import { PROTOCOL_VERSION } from './protocol'
import { applyRekey, keyKindFor, rotate, type RekeyClient } from './rekey'
import type { ClientKind } from './schemas'

const crypto = createWebCryptoProvider()

describe('SessionKeys', () => {
  it('derives the players root from the staff root, and the same players key from either link', async () => {
    const ctl = await makeController(crypto)
    const player = await keysFromInvite(ctl, 'players')
    const staff = await keysFromInvite(ctl, 'staff')
    expect(bytesEqual(player.sealingKey('players').key, staff.sealingKey('players').key)).toBe(true)
    expect(bytesEqual(staff.sealingKey('staff').key, ctl.keys.sealingKey('staff').key)).toBe(true)
    expect(player.hasStaff).toBe(false)
    expect(staff.hasStaff).toBe(true)
    expect(player.isController).toBe(false)
    expect(ctl.keys.isController).toBe(true)
    expect(bytesEqual(player.controllerEcdhPub!, ctl.keys.controllerEcdhPub!)).toBe(true)
  })

  it('derives the join token from the players root, the same for every holder, different per epoch', async () => {
    const ctl = await makeController(crypto)
    const player = await keysFromInvite(ctl, 'players')
    const staff = await keysFromInvite(ctl, 'staff')
    const token = await ctl.keys.joinToken()
    expect(token.length).toBe(16)
    expect(toHex(await player.joinToken())).toBe(toHex(token))
    expect(toHex(await staff.joinToken())).toBe(toHex(token))
    await ctl.keys.addEpoch(2, 'staff', crypto.random(32))
    expect(toHex(await ctl.keys.joinToken(2))).not.toBe(toHex(token))
    expect(await ctl.keys.joinTokenHash(1)).toHaveLength(64)
  })

  it('names keys s<epoch> and t<epoch> and reports unknown epochs', async () => {
    const ctl = await makeController(crypto)
    expect(ctl.keys.sealingKey('players').name).toBe('s1')
    expect(ctl.keys.sealingKey('staff').name).toBe('t1')
    expect(ctl.keys.lookup('s2')).toEqual({ ok: false, reason: 'UNKNOWN_EPOCH' })
    expect(ctl.keys.lookup('t2')).toEqual({ ok: false, reason: 'UNKNOWN_EPOCH' })
    expect(ctl.keys.lookup('zz')).toEqual({ ok: false, reason: 'UNKNOWN_EPOCH' })
    const player = await keysFromInvite(ctl, 'players')
    expect(player.lookup('t1')).toEqual({ ok: false, reason: 'STAFF_ONLY' })
  })

  it('refuses bad epochs, root sizes and controller keys', async () => {
    const keys = new SessionKeys(IDS.session, crypto)
    await expect(keys.addEpoch(0, 'staff', crypto.random(32))).rejects.toThrow(/epoch/)
    await expect(keys.addEpoch(10_000, 'staff', crypto.random(32))).rejects.toThrow(/epoch/)
    await expect(keys.addEpoch(1, 'staff', crypto.random(16))).rejects.toThrow(/32 bytes/)
    expect(
      () => new SessionKeys(IDS.session, crypto, { controllerEcdhPub: new Uint8Array(33) }),
    ).toThrow(/65 bytes/)
  })
})

describe('staff proof in join', () => {
  async function joinFrom(
    ctl: Controller,
    keys: SessionKeys,
    clientId: string,
    kind: ClientKind,
    over: Record<string, unknown> = {},
  ) {
    const ecdh = await crypto.ecdhGenerate()
    const payload = { ...(await buildJoin(keys, clientId, ecdh, { name: 'x', kind })), ...over }
    const env = await seal(
      crypto,
      keys,
      {
        v: PROTOCOL_VERSION,
        session: IDS.session,
        seq: 1,
        from: clientId,
        to: 'controller',
        type: 'join',
        ts: 1,
      },
      payload as never,
    )
    const opened = await open(encodeFrame(env), {
      crypto,
      keys: ctl.keys,
      controllerPub: ctl.controllerPub,
    })
    if (!opened.ok) throw new Error(opened.reason)
    return { msg: opened.msg as Opened<'join'>, ecdh }
  }

  it('a staff link holder proves it; the controller believes the claim', async () => {
    const ctl = await makeController(crypto)
    const staff = await keysFromInvite(ctl, 'staff')
    const { msg } = await joinFrom(ctl, staff, IDS.evaluator, 'evaluator')
    expect(msg.payload.staffProof).toHaveLength(43)
    expect(await verifyJoin(ctl.keys, msg)).toMatchObject({
      kind: 'evaluator',
      claimedStaff: true,
      staff: true,
    })
  })

  it('a players link holder claiming evaluator has no proof and is not staff', async () => {
    const ctl = await makeController(crypto)
    const player = await keysFromInvite(ctl, 'players')
    const { msg } = await joinFrom(ctl, player, IDS.playerA, 'evaluator')
    expect(msg.payload.staffProof).toBeUndefined()
    expect(await verifyJoin(ctl.keys, msg)).toMatchObject({ claimedStaff: true, staff: false })
  })

  it('a forged, replayed or old-epoch proof fails', async () => {
    const ctl = await makeController(crypto)
    const staff = await keysFromInvite(ctl, 'staff')
    const player = await keysFromInvite(ctl, 'players')
    const real = await joinFrom(ctl, staff, IDS.evaluator, 'evaluator')
    // Random bytes.
    const forged = await joinFrom(ctl, player, IDS.playerA, 'evaluator', {
      staffProof: toBase64Url(crypto.random(32)),
    })
    expect((await verifyJoin(ctl.keys, forged.msg)).staff).toBe(false)
    // A real proof replayed from another client id (bound to clientId and ecdhPub).
    const replayed = await joinFrom(ctl, player, IDS.playerA, 'evaluator', {
      staffProof: real.msg.payload.staffProof,
    })
    expect((await verifyJoin(ctl.keys, replayed.msg)).staff).toBe(false)
    // After a rotation, a proof from the old staff root no longer counts.
    await rotate(crypto, ctl.keys, [], [])
    expect((await verifyJoin(ctl.keys, real.msg)).staff).toBe(false)
  })

  it('a player kind never carries a proof even from a staff device', async () => {
    const ctl = await makeController(crypto)
    const staff = await keysFromInvite(ctl, 'staff')
    const { msg } = await joinFrom(ctl, staff, IDS.playerA, 'player')
    expect(msg.payload.staffProof).toBeUndefined()
    expect(await verifyJoin(ctl.keys, msg)).toMatchObject({ claimedStaff: false, staff: false })
  })
})

describe('key rotation', () => {
  async function room(provider: CryptoProvider = crypto) {
    const ctl = await makeController(provider)
    const make = async (clientId: string, kind: ClientKind) => {
      const keys = await keysFromInvite(ctl, keyKindFor(kind), provider)
      const ecdh = await provider.ecdhGenerate()
      const staff = keys.hasStaff && keyKindFor(kind) === 'staff'
      return { clientId, kind, keys, ecdh, ecdhPub: ecdh.publicKey, staff }
    }
    const a = await make(IDS.playerA, 'player')
    const b = await make(IDS.playerB, 'player')
    const e = await make(IDS.evaluator, 'evaluator')
    return {
      ctl,
      clients: [a, b, e] as (RekeyClient & { keys: SessionKeys; ecdh: typeof a.ecdh })[],
    }
  }

  it('three clients, kick one: the two kept read the new epoch, the kicked one cannot', async () => {
    const { ctl, clients } = await room()
    const [a, b, e] = clients
    const rotation = await rotate(ctl.crypto, ctl.keys, clients, [b!.clientId])
    expect(rotation.epoch).toBe(2)
    expect(ctl.keys.currentEpoch).toBe(2)
    expect(rotation.messages.map((m) => m.to).sort()).toEqual(
      [`client:${a!.clientId}`, `client:${e!.clientId}`].sort(),
    )
    expect(rotation.messages.find((m) => m.to === `client:${e!.clientId}`)!.payload.key).toBe(
      'staff',
    )
    expect(rotation.messages.find((m) => m.to === `client:${a!.clientId}`)!.payload.key).toBe(
      'players',
    )

    for (const c of [a!, e!]) {
      const msg = rotation.messages.find((m) => m.to === `client:${c.clientId}`)!
      expect(await applyRekey(ctl.crypto, c.keys, c.clientId, c.ecdh, msg.payload)).toBe(2)
      expect(c.keys.currentEpoch).toBe(2)
    }
    expect(e!.keys.hasStaff).toBe(true)
    expect(a!.keys.hasStaff).toBe(false)

    const post = await seal(
      ctl.crypto,
      ctl.keys,
      {
        v: PROTOCOL_VERSION,
        session: IDS.session,
        seq: 9,
        from: IDS.controller,
        to: 'all',
        type: 'clock.state',
        ts: 1,
      },
      PAYLOAD_FIXTURES['clock.state'],
      { signer: ctl.signing.privateKey },
    )
    const ctx = (keys: SessionKeys) => ({ crypto, keys, controllerPub: ctl.controllerPub })
    expect((await open(encodeFrame(post), ctx(a!.keys))).ok).toBe(true)
    expect((await open(encodeFrame(post), ctx(e!.keys))).ok).toBe(true)
    expect((await open(encodeFrame(post), ctx(b!.keys))) as object).toMatchObject({
      ok: false,
      reason: 'UNKNOWN_EPOCH',
    })
  })

  it('an unproven staff claim gets the players root, never the staff root', async () => {
    const { ctl, clients } = await room()
    const [a] = clients
    // The controller recorded this device's claim as unproven (verifyJoin said staff: false).
    const rotation = await rotate(
      ctl.crypto,
      ctl.keys,
      [{ clientId: a!.clientId, ecdhPub: a!.ecdhPub, staff: false }],
      [],
    )
    expect(rotation.messages[0]!.payload.key).toBe('players')
    await applyRekey(ctl.crypto, a!.keys, a!.clientId, a!.ecdh, rotation.messages[0]!.payload)
    expect(a!.keys.hasStaff).toBe(false)
    const assign = await seal(
      ctl.crypto,
      ctl.keys,
      {
        v: PROTOCOL_VERSION,
        session: IDS.session,
        seq: 9,
        from: IDS.controller,
        to: `client:${a!.clientId}`,
        type: 'eval.assign',
        ts: 1,
      },
      PAYLOAD_FIXTURES['eval.assign'],
      { signer: ctl.signing.privateKey },
    )
    expect(
      (await open(encodeFrame(assign), {
        crypto,
        keys: a!.keys,
        controllerPub: ctl.controllerPub,
      })) as object,
    ).toMatchObject({ ok: false, reason: 'STAFF_ONLY' })
  })

  it("a kicked client cannot unwrap another client's rekey message", async () => {
    const { ctl, clients } = await room()
    const [a, b] = clients
    const rotation = await rotate(ctl.crypto, ctl.keys, clients, [b!.clientId])
    const forA = rotation.messages.find((m) => m.to === `client:${a!.clientId}`)!
    await expect(
      applyRekey(ctl.crypto, b!.keys, b!.clientId, b!.ecdh, forA.payload),
    ).rejects.toThrow()
    await expect(
      applyRekey(ctl.crypto, b!.keys, a!.clientId, b!.ecdh, forA.payload),
    ).rejects.toThrow()
    expect(b!.keys.currentEpoch).toBe(1)
  })

  it('a joiner with the new link reads re-emitted state but not epoch-1 history; join tokens differ', async () => {
    const { ctl, clients } = await room()
    const oldToken = toHex(await ctl.keys.joinToken())
    const h = {
      v: PROTOCOL_VERSION as 1,
      session: IDS.session,
      seq: 1,
      from: IDS.controller,
      to: 'all' as const,
      type: 'clock.state' as const,
      ts: 1,
    }
    const history = await seal(ctl.crypto, ctl.keys, h, PAYLOAD_FIXTURES['clock.state'], {
      signer: ctl.signing.privateKey,
    })
    await rotate(ctl.crypto, ctl.keys, clients, [])
    const invite = parseInvite(ctl.invite('players'))
    expect(invite.epoch).toBe(2)
    const late = new SessionKeys(IDS.session, crypto, {
      controllerEcdhPub: invite.controllerEcdhPub,
    })
    await late.addEpoch(invite.epoch, invite.key.kind, invite.key.root)
    const ctx = { crypto, keys: late, controllerPub: ctl.controllerPub }
    expect((await open(encodeFrame(history), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'UNKNOWN_EPOCH',
    })
    const reemitted = await seal(
      ctl.crypto,
      ctl.keys,
      { ...h, seq: 2 },
      PAYLOAD_FIXTURES['clock.state'],
      { signer: ctl.signing.privateKey },
    )
    expect((await open(encodeFrame(reemitted), ctx)).ok).toBe(true)
    expect(toHex(await late.joinToken())).not.toBe(oldToken)
    expect(toHex(await late.joinToken())).toBe(toHex(await ctl.keys.joinToken()))
  })

  it('kept clients still read epoch-1 history after the rotation', async () => {
    const { ctl, clients } = await room()
    const [a] = clients
    const history = await seal(
      ctl.crypto,
      ctl.keys,
      {
        v: PROTOCOL_VERSION,
        session: IDS.session,
        seq: 1,
        from: IDS.controller,
        to: 'all',
        type: 'clock.state',
        ts: 1,
      },
      PAYLOAD_FIXTURES['clock.state'],
      { signer: ctl.signing.privateKey },
    )
    const rotation = await rotate(ctl.crypto, ctl.keys, clients, [])
    await applyRekey(ctl.crypto, a!.keys, a!.clientId, a!.ecdh, rotation.messages[0]!.payload)
    expect(a!.keys.knownEpochs).toEqual([1, 2])
    expect(
      (
        await open(encodeFrame(history), {
          crypto,
          keys: a!.keys,
          controllerPub: ctl.controllerPub,
        })
      ).ok,
    ).toBe(true)
  })

  it('refuses a rekey to an epoch already known and a rekey with a tampered wrap', async () => {
    const { ctl, clients } = await room()
    const [a] = clients
    const rotation = await rotate(ctl.crypto, ctl.keys, clients, [])
    const payload = rotation.messages[0]!.payload
    const tampered = {
      ...payload,
      wrapped: { ...payload.wrapped, c: toBase64Url(crypto.random(48)) },
    }
    await expect(applyRekey(ctl.crypto, a!.keys, a!.clientId, a!.ecdh, tampered)).rejects.toThrow(
      /tag/,
    )
    await applyRekey(ctl.crypto, a!.keys, a!.clientId, a!.ecdh, payload)
    await expect(applyRekey(ctl.crypto, a!.keys, a!.clientId, a!.ecdh, payload)).rejects.toThrow(
      /already known/,
    )
  })

  it('runs the whole rotation on the noble provider', async () => {
    const noble = await createNobleProvider()
    const { ctl, clients } = await room(noble)
    const [a, , e] = clients
    const rotation = await rotate(noble, ctl.keys, clients, [])
    for (const c of [a!, e!]) {
      const msg = rotation.messages.find((m) => m.to === `client:${c.clientId}`)!
      expect(await applyRekey(noble, c.keys, c.clientId, c.ecdh, msg.payload)).toBe(2)
    }
    expect(e!.keys.hasStaff).toBe(true)
    expect(a!.keys.hasStaff).toBe(false)
    const post = await seal(
      noble,
      ctl.keys,
      {
        v: PROTOCOL_VERSION,
        session: IDS.session,
        seq: 9,
        from: IDS.controller,
        to: `client:${e!.clientId}`,
        type: 'eval.assign',
        ts: 1,
      },
      PAYLOAD_FIXTURES['eval.assign'],
      { signer: ctl.signing.privateKey },
    )
    expect(
      (
        await open(encodeFrame(post), {
          crypto: noble,
          keys: e!.keys,
          controllerPub: ctl.controllerPub,
        })
      ).ok,
    ).toBe(true)
  })
})
