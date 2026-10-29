import { describe, expect, it } from 'vitest'
import { fromBase64Url, toBase64Url } from './bytes'
import {
  aadFor,
  encodeFrame,
  open,
  parseFrame,
  rowMatchesPrefix,
  ScopeState,
  seal,
  SealError,
  sealPlain,
  type OpenContext,
} from './codec'
import { SessionKeys } from './crypto/keys'
import { createNobleProvider } from './crypto/noble'
import { IDS, PAYLOAD_FIXTURES } from './fixtures/payloads'
import { keysFromInvite, makeController, type Controller } from './fixtures/setup'
import { parseInvite } from './invite'
import {
  KEY_BY_TYPE,
  LIMITS,
  PROTOCOL_VERSION,
  SIGNED_TYPES,
  type MessageType,
  type SealKind,
  type SealedType,
} from './protocol'
import { ReplayGuard } from './replay'
import { Ciphertext } from './schemas'
import type { ControllerRosterPayload, Destination, Envelope, EnvelopeHeader } from './schemas'

const SEALED_TYPES = Object.keys(KEY_BY_TYPE) as SealedType[]

function header<T extends MessageType>(
  type: T,
  over: Partial<Omit<EnvelopeHeader, 'type'>> = {},
): EnvelopeHeader & { type: T } {
  return {
    v: PROTOCOL_VERSION,
    session: IDS.session,
    seq: 1,
    from: IDS.controller,
    to: 'all',
    ts: 1_700_000_000_000,
    ...over,
    type,
  }
}

async function contexts(ctl: Controller) {
  const player = await keysFromInvite(ctl, 'players')
  const staff = await keysFromInvite(ctl, 'staff')
  const ctx = (keys: SessionKeys, extra: Partial<OpenContext> = {}): OpenContext => ({
    crypto: ctl.crypto,
    keys,
    controllerPub: ctl.controllerPub,
    ...extra,
  })
  return {
    player: ctx(player),
    staff: ctx(staff),
    controller: ctx(ctl.keys),
    playerKeys: player,
    staffKeys: staff,
  }
}

/** For a type's rule: where a test sends it, under which key, and who can open it. */
function plan(type: SealedType): { to: Destination; key: SealKind; from: string } {
  const rule = KEY_BY_TYPE[type]
  if (rule === 'controller') return { to: 'controller', key: 'controller', from: IDS.playerA }
  if (rule === 'staff') return { to: `client:${IDS.evaluator}`, key: 'staff', from: IDS.controller }
  return { to: 'all', key: 'players', from: IDS.controller }
}

describe('seal and open', () => {
  it.each(SEALED_TYPES)('round-trips %s', async (type) => {
    const ctl = await makeController()
    const { staff, controller } = await contexts(ctl)
    const { to, key, from } = plan(type)
    const sealer = from === IDS.controller ? ctl.keys : (await contexts(ctl)).playerKeys
    const env = await seal(ctl.crypto, sealer, header(type, { to, from }), PAYLOAD_FIXTURES[type], {
      signer: from === IDS.controller ? ctl.signing.privateKey : undefined,
      key: KEY_BY_TYPE[type] === 'either' ? 'players' : undefined,
    })
    const frame = encodeFrame(env)
    expect(parseFrame(frame).ok).toBe(true)
    const result = await open(frame, key === 'controller' ? controller : staff)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(result.msg.type).toBe(type)
    expect(result.msg.payload).toEqual(
      (await import('./schemas')).PAYLOAD_SCHEMAS[type].parse(PAYLOAD_FIXTURES[type]),
    )
    const signed = SIGNED_TYPES.has(type) || (type === 'call.end' && from === IDS.controller)
    expect(result.msg.signedBy).toBe(signed ? 'host' : undefined)
    expect(result.msg.key).toBe(key)
  })

  it('round-trips a plaintext server frame without a key', async () => {
    const ctl = await makeController()
    const { player } = await contexts(ctl)
    const env = sealPlain(
      header('presence', { from: 'server', seq: 0, to: `client:${IDS.playerA}` }),
      PAYLOAD_FIXTURES.presence,
    )
    const result = await open(encodeFrame(env), player)
    expect(result.ok && result.msg.payload).toEqual(PAYLOAD_FIXTURES.presence)
  })

  it('refuses to seal a payload that fails its schema', async () => {
    const ctl = await makeController()
    await expect(
      seal(ctl.crypto, ctl.keys, header('vote.cast', { to: 'controller' }), {
        voteId: 'bad',
        optionId: 'yes',
      } as never),
    ).rejects.toBeInstanceOf(SealError)
  })

  it('refuses a signed type with no signer', async () => {
    const ctl = await makeController()
    await expect(
      seal(ctl.crypto, ctl.keys, header('clock.state'), PAYLOAD_FIXTURES['clock.state']),
    ).rejects.toMatchObject({ code: 'NO_SIGNER' })
  })

  it('uses a fresh random nonce for every frame (10 000 seals, no repeat)', async () => {
    const ctl = await makeController()
    const nonces = new Set<string>()
    for (let i = 0; i < 10_000; i++) {
      const env = await seal(
        ctl.crypto,
        ctl.keys,
        header('clock.state', { seq: i + 1 }),
        PAYLOAD_FIXTURES['clock.state'],
        { signer: ctl.signing.privateKey },
      )
      nonces.add((env.payload as Ciphertext).n)
    }
    expect(nonces.size).toBe(10_000)
  })
})

describe('frames to the controller are sealed to the controller alone', () => {
  it('a vote.cast opens only on the controller; players and staff see CONTROLLER_ONLY', async () => {
    const ctl = await makeController()
    const { player, staff, controller, playerKeys } = await contexts(ctl)
    const env = await seal(
      ctl.crypto,
      playerKeys,
      header('vote.cast', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['vote.cast'],
    )
    const c = env.payload as Ciphertext
    expect(c.k).toBe('c')
    expect(c.e).toHaveLength(87)
    expect((await open(encodeFrame(env), controller)) as object).toMatchObject({
      ok: true,
      msg: { key: 'controller', from: IDS.playerA },
    })
    expect((await open(encodeFrame(env), player)) as object).toMatchObject({
      ok: false,
      reason: 'CONTROLLER_ONLY',
    })
    expect((await open(encodeFrame(env), staff)) as object).toMatchObject({
      ok: false,
      reason: 'CONTROLLER_ONLY',
    })
  })

  it('a device with a different ECDH key than the invite names cannot open it', async () => {
    const ctl = await makeController()
    const other = await makeController()
    const { playerKeys } = await contexts(ctl)
    const env = await seal(
      ctl.crypto,
      playerKeys,
      header('survey.response', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['survey.response'],
    )
    const impostor = new SessionKeys(IDS.session, ctl.crypto, {
      controllerEcdh: other.keys.controllerEcdh,
    })
    await impostor.addEpoch(1, 'players', playerKeys.root('players')!)
    expect(
      (await open(encodeFrame(env), {
        crypto: ctl.crypto,
        keys: impostor,
        controllerPub: ctl.controllerPub,
      })) as object,
    ).toMatchObject({ ok: false, reason: 'BAD_TAG' })
  })

  it('a swapped ephemeral key fails the tag', async () => {
    const ctl = await makeController()
    const { controller, playerKeys } = await contexts(ctl)
    const a = await seal(
      ctl.crypto,
      playerKeys,
      header('vote.cast', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['vote.cast'],
    )
    const b = await seal(
      ctl.crypto,
      playerKeys,
      header('vote.cast', { from: IDS.playerA, to: 'controller', seq: 2 }),
      PAYLOAD_FIXTURES['vote.cast'],
    )
    const swapped = {
      ...a,
      payload: { ...(a.payload as Ciphertext), e: (b.payload as Ciphertext).e },
    }
    expect((await open(JSON.stringify(swapped), controller)) as object).toMatchObject({
      ok: false,
      reason: 'BAD_TAG',
    })
  })

  it('a controller-only type sent anywhere else, or a session key used towards the controller, is refused', async () => {
    const ctl = await makeController()
    const { controller, playerKeys } = await contexts(ctl)
    await expect(
      seal(
        ctl.crypto,
        playerKeys,
        header('vote.cast', { from: IDS.playerA, to: 'all' }),
        PAYLOAD_FIXTURES['vote.cast'],
      ),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    await expect(
      seal(
        ctl.crypto,
        playerKeys,
        header('message.send', { from: IDS.playerA, to: 'controller' }),
        PAYLOAD_FIXTURES['message.send'],
        { key: 'players' },
      ),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    // Forged: a players-key ciphertext addressed to the controller.
    const { name, key } = playerKeys.sealingKey('players')
    const h = header('inject.receipt', { from: IDS.playerA, to: 'controller' })
    const nonce = ctl.crypto.random(12)
    const c = await ctl.crypto.aesGcmSeal(
      key,
      nonce,
      new TextEncoder().encode(aadFor(h)),
      new TextEncoder().encode(JSON.stringify(PAYLOAD_FIXTURES['inject.receipt'])),
    )
    const forged: Envelope = {
      ...h,
      payload: { k: name, n: toBase64Url(nonce), c: toBase64Url(c) },
    }
    expect((await open(encodeFrame(forged), controller)) as object).toMatchObject({
      ok: false,
      reason: 'WRONG_KEY',
    })
  })

  it('a device whose invite lacks the controller key cannot seal to it', async () => {
    const ctl = await makeController()
    const keys = new SessionKeys(IDS.session, ctl.crypto)
    await keys.addEpoch(1, 'players', ctl.keys.root('players')!)
    await expect(
      seal(
        ctl.crypto,
        keys,
        header('join', { from: IDS.playerA, to: 'controller' }),
        PAYLOAD_FIXTURES.join,
      ),
    ).rejects.toMatchObject({ code: 'NO_CONTROLLER_KEY' })
  })
})

describe('mixed-key types need an explicit key unless the destination decides', () => {
  it('message.send to a role without a key is refused; to role:evaluators it is staff; to controller it is sealed to the controller', async () => {
    const ctl = await makeController()
    const { playerKeys } = await contexts(ctl)
    await expect(
      seal(
        ctl.crypto,
        ctl.keys,
        header('message.send', { to: 'role:pio' }),
        PAYLOAD_FIXTURES['message.send'],
      ),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    const toStaff = await seal(
      ctl.crypto,
      ctl.keys,
      header('message.send', { to: 'role:evaluators' }),
      PAYLOAD_FIXTURES['message.send'],
    )
    expect((toStaff.payload as Ciphertext).k).toBe('t1')
    const toController = await seal(
      ctl.crypto,
      playerKeys,
      header('message.send', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['message.send'],
    )
    expect((toController.payload as Ciphertext).k).toBe('c')
    const explicit = await seal(
      ctl.crypto,
      ctl.keys,
      header('message.send', { to: 'role:pio' }),
      PAYLOAD_FIXTURES['message.send'],
      { key: 'players' },
    )
    expect((explicit.payload as Ciphertext).k).toBe('s1')
  })

  it('controller.notice and call.end follow the same rule', async () => {
    const ctl = await makeController()
    await expect(
      seal(
        ctl.crypto,
        ctl.keys,
        header('controller.notice'),
        PAYLOAD_FIXTURES['controller.notice'],
        { signer: ctl.signing.privateKey },
      ),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    await expect(
      seal(
        ctl.crypto,
        ctl.keys,
        header('call.end', { to: 'role:pio' }),
        PAYLOAD_FIXTURES['call.end'],
        { signer: ctl.signing.privateKey },
      ),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    const ok = await seal(
      ctl.crypto,
      ctl.keys,
      header('call.end', { to: 'role:pio' }),
      PAYLOAD_FIXTURES['call.end'],
      { signer: ctl.signing.privateKey, key: 'players' },
    )
    expect((ok.payload as Ciphertext).k).toBe('s1')
  })
})

describe('tampering', () => {
  async function sealed(ctl: Controller) {
    return seal(
      ctl.crypto,
      ctl.keys,
      header('inject.release', { to: 'role:ops-director', seq: 7 }),
      PAYLOAD_FIXTURES['inject.release'],
      { signer: ctl.signing.privateKey, key: 'players' },
    )
  }

  it.each(['v', 'session', 'seq', 'from', 'to', 'type', 'ts'] as const)(
    'a changed header field %s fails',
    async (field) => {
      const ctl = await makeController()
      const { player } = await contexts(ctl)
      const env = await sealed(ctl)
      const changed: Record<string, unknown> = { ...env }
      const alternatives: Record<string, unknown> = {
        v: 2,
        session: IDS.playerB,
        seq: 8,
        from: IDS.playerA,
        to: 'role:pio',
        type: 'inject.recall',
        ts: env.ts + 1,
      }
      changed[field] = alternatives[field]
      const result = await open(JSON.stringify(changed), player)
      expect(result.ok).toBe(false)
      if (result.ok) return
      // v cannot change and still parse; the signature binds the rest of the header, the tag too.
      expect(field === 'v' ? ['PARSE'] : ['BAD_SIG', 'BAD_TAG']).toContain(result.reason)
    },
  )

  it('a flipped bit in the nonce, the ciphertext or the signature fails', async () => {
    const ctl = await makeController()
    const { player } = await contexts(ctl)
    const env = await sealed(ctl)
    const flip = (s: string) => {
      const bytes = fromBase64Url(s)
      bytes[0]! ^= 0x01
      return toBase64Url(bytes)
    }
    const c = env.payload as Ciphertext
    for (const [name, variant] of [
      ['nonce', { ...env, payload: { ...c, n: flip(c.n) } }],
      ['ciphertext', { ...env, payload: { ...c, c: flip(c.c) } }],
      ['signature', { ...env, sig: flip(env.sig!) }],
    ] as const) {
      const result = await open(JSON.stringify(variant), player)
      expect(result.ok, name).toBe(false)
      if (!result.ok) expect(['BAD_SIG', 'BAD_TAG'], name).toContain(result.reason)
    }
  })

  it('an unsigned frame on a signed type is UNSIGNED_CONTROLLER_MESSAGE', async () => {
    const ctl = await makeController()
    const { player } = await contexts(ctl)
    const { sig: _sig, ...unsigned } = await sealed(ctl)
    const result = await open(JSON.stringify(unsigned), player)
    expect(result.ok === false && result.reason).toBe('UNSIGNED_CONTROLLER_MESSAGE')
  })

  it('a frame signed by another key is BAD_SIG, even with the right session key', async () => {
    const ctl = await makeController()
    const { player } = await contexts(ctl)
    const impostor = await ctl.crypto.ecdsaGenerate()
    const env = await seal(
      ctl.crypto,
      ctl.keys,
      header('clock.state'),
      PAYLOAD_FIXTURES['clock.state'],
      {
        signer: impostor.privateKey,
      },
    )
    const result = await open(encodeFrame(env), player)
    expect(result.ok === false && result.reason).toBe('BAD_SIG')
  })

  it('a signature on a type that is not normally signed must still verify', async () => {
    const ctl = await makeController()
    const { player } = await contexts(ctl)
    const good = await seal(
      ctl.crypto,
      ctl.keys,
      header('message.send'),
      PAYLOAD_FIXTURES['message.send'],
      {
        signer: ctl.signing.privateKey,
        sign: true,
        key: 'players',
      },
    )
    const opened = await open(encodeFrame(good), player)
    expect(opened.ok && opened.msg.signedBy).toBe('host')
    const bad = { ...good, sig: toBase64Url(ctl.crypto.random(64)) }
    const result = await open(JSON.stringify(bad), player)
    expect(result.ok === false && result.reason).toBe('BAD_SIG')
  })

  it('a frame sealed for another session fails', async () => {
    const ctl = await makeController()
    const other = await makeController()
    const { controller } = await contexts(ctl)
    const otherPlayer = await keysFromInvite(other, 'players')
    const env = await seal(
      other.crypto,
      otherPlayer,
      header('vote.cast', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['vote.cast'],
    )
    const result = await open(encodeFrame(env), controller)
    expect(result.ok).toBe(false)
  })

  it('a frame over the connection size cap is dropped before parsing', async () => {
    const ctl = await makeController()
    const { player } = await contexts(ctl)
    const huge = JSON.stringify({ pad: 'x'.repeat(LIMITS.relay.envelopeBytes) })
    const result = await open(huge, { ...player, limits: LIMITS.relay })
    expect(result.ok === false && result.reason).toBe('SIZE')
    expect((await open('not json', player)).ok).toBe(false)
  })

  it('a plaintext payload on a sealed type, or a sealed payload on a plaintext type, is PARSE', async () => {
    const ctl = await makeController()
    const { player, controller } = await contexts(ctl)
    const plain: Envelope = {
      ...header('vote.cast', { from: IDS.playerA, to: 'controller' }),
      payload: PAYLOAD_FIXTURES['vote.cast'] as Record<string, unknown>,
    }
    expect((await open(encodeFrame(plain), controller)) as object).toMatchObject({
      ok: false,
      reason: 'PARSE',
    })
    const c = (
      await seal(ctl.crypto, ctl.keys, header('clock.state'), PAYLOAD_FIXTURES['clock.state'], {
        signer: ctl.signing.privateKey,
      })
    ).payload
    const sealedPresence: Envelope = {
      ...header('presence', { from: 'server', seq: 0 }),
      payload: c,
    }
    expect((await open(encodeFrame(sealedPresence), player)) as object).toMatchObject({
      ok: false,
      reason: 'PARSE',
    })
  })

  it('a ciphertext with an ephemeral key on a session-key name, or without one on "c", is not a ciphertext and the frame is PARSE', async () => {
    const ctl = await makeController()
    const { controller } = await contexts(ctl)
    const base = { n: 'AAAAAAAAAAAAAAAA', c: 'AAAA' }
    const e = 'B' + 'A'.repeat(86)
    expect(Ciphertext.safeParse({ ...base, k: 'c' }).success).toBe(false)
    expect(Ciphertext.safeParse({ ...base, k: 's1', e }).success).toBe(false)
    expect(Ciphertext.safeParse({ ...base, k: 'c', e }).success).toBe(true)
    for (const payload of [
      { ...base, k: 'c' },
      { ...base, k: 's1', e },
    ]) {
      const frame: Envelope = {
        ...header('vote.cast', { from: IDS.playerA, to: 'controller' }),
        payload,
      }
      expect((await open(encodeFrame(frame), controller)) as object).toMatchObject({
        ok: false,
        reason: 'PARSE',
      })
    }
  })
})

describe('AAD', () => {
  it('is deterministic and covers every header field in a fixed order', () => {
    const h = header('join', { seq: 3, from: IDS.playerA, to: 'controller' })
    expect(aadFor(h)).toBe(
      `[1,"${IDS.session}",3,"${IDS.playerA}","controller","join",1700000000000]`,
    )
    expect(aadFor({ ...h, sig: 'x', payload: {} } as never)).toBe(aadFor(h))
  })
})

describe('replay protection', () => {
  const cast = (ctl: Controller, keys: SessionKeys, from: string, seq: number) =>
    seal(
      ctl.crypto,
      keys,
      header('vote.cast', { from, to: 'controller', seq }),
      PAYLOAD_FIXTURES['vote.cast'],
    )

  it('drops the same frame twice, a lower seq, and keeps two senders apart', async () => {
    const ctl = await makeController()
    const { controller, playerKeys } = await contexts(ctl)
    const guard = new ReplayGuard()
    const ctx = { ...controller, replay: guard }
    const a2 = await cast(ctl, playerKeys, IDS.playerA, 2)
    const a1 = await cast(ctl, playerKeys, IDS.playerA, 1)
    const b1 = await cast(ctl, playerKeys, IDS.playerB, 1)
    expect((await open(encodeFrame(a2), ctx)).ok).toBe(true)
    expect((await open(encodeFrame(a2), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'REPLAY',
    })
    expect((await open(encodeFrame(a1), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'REPLAY',
    })
    expect((await open(encodeFrame(b1), ctx)).ok).toBe(true)
    expect(guard.lastSeq(IDS.playerA)).toBe(2)
    expect(guard.dropped).toBe(2)
  })

  it('does not advance the sender seq when the frame failed to open', async () => {
    const ctl = await makeController()
    const { controller, playerKeys } = await contexts(ctl)
    const guard = new ReplayGuard()
    const ctx = { ...controller, replay: guard }
    const env = await cast(ctl, playerKeys, IDS.playerA, 5)
    const broken = {
      ...env,
      payload: { ...(env.payload as Ciphertext), c: toBase64Url(ctl.crypto.random(40)) },
    }
    expect((await open(JSON.stringify(broken), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'BAD_TAG',
    })
    expect(guard.lastSeq(IDS.playerA)).toBe(0)
    expect((await open(encodeFrame(env), ctx)).ok).toBe(true)
  })

  it('never guards server frames', () => {
    const guard = new ReplayGuard()
    expect(guard.check('server', 0)).toBe(true)
    guard.commit('server', 0)
    expect(guard.check('server', 0)).toBe(true)
  })
})

describe('two session keys: players and staff', () => {
  it('a player cannot open a staff-sealed frame; staff and the controller can', async () => {
    const ctl = await makeController()
    const { player, staff, controller } = await contexts(ctl)
    const env = await seal(
      ctl.crypto,
      ctl.keys,
      header('eval.assign', { to: `client:${IDS.evaluator}` }),
      PAYLOAD_FIXTURES['eval.assign'],
      {
        signer: ctl.signing.privateKey,
      },
    )
    expect((env.payload as Ciphertext).k).toBe('t1')
    expect((await open(encodeFrame(env), player)) as object).toMatchObject({
      ok: false,
      reason: 'STAFF_ONLY',
    })
    expect((await open(encodeFrame(env), staff)).ok).toBe(true)
    expect((await open(encodeFrame(env), controller)).ok).toBe(true)
  })

  it('an evaluator observation is sealed to the controller: not even other staff read it', async () => {
    const ctl = await makeController()
    const { controller, staffKeys, player, staff } = await contexts(ctl)
    const env = await seal(
      ctl.crypto,
      staffKeys,
      header('eval.observation', { from: IDS.evaluator, to: 'controller' }),
      PAYLOAD_FIXTURES['eval.observation'],
    )
    expect((env.payload as Ciphertext).k).toBe('c')
    expect((await open(encodeFrame(env), controller)).ok).toBe(true)
    expect((await open(encodeFrame(env), player)) as object).toMatchObject({
      ok: false,
      reason: 'CONTROLLER_ONLY',
    })
    expect((await open(encodeFrame(env), staff)) as object).toMatchObject({
      ok: false,
      reason: 'CONTROLLER_ONLY',
    })
  })

  it('refuses to seal staff-only types under the players key and players-only types under the staff key', async () => {
    const ctl = await makeController()
    await expect(
      seal(ctl.crypto, ctl.keys, header('eval.assign'), PAYLOAD_FIXTURES['eval.assign'], {
        signer: ctl.signing.privateKey,
        key: 'players',
      }),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    await expect(
      seal(ctl.crypto, ctl.keys, header('clock.state'), PAYLOAD_FIXTURES['clock.state'], {
        signer: ctl.signing.privateKey,
        key: 'staff',
      }),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
  })

  it('an inject.release with expectedAction picks the staff key by itself and refuses the players key', async () => {
    const ctl = await makeController()
    const { player, staff } = await contexts(ctl)
    const withExpected = {
      ...PAYLOAD_FIXTURES['inject.release'],
      expectedAction: 'Activates the EOC.',
    }
    const auto = await seal(
      ctl.crypto,
      ctl.keys,
      header('inject.release', { to: 'role:evaluators' }),
      withExpected,
      {
        signer: ctl.signing.privateKey,
      },
    )
    expect((auto.payload as Ciphertext).k).toBe('t1')
    await expect(
      seal(ctl.crypto, ctl.keys, header('inject.release'), withExpected, {
        signer: ctl.signing.privateKey,
        key: 'players',
      }),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    expect((await open(encodeFrame(auto), staff)).ok).toBe(true)
    expect((await open(encodeFrame(auto), player)) as object).toMatchObject({
      ok: false,
      reason: 'STAFF_ONLY',
    })
    const playerCopy = await seal(
      ctl.crypto,
      ctl.keys,
      header('inject.release'),
      PAYLOAD_FIXTURES['inject.release'],
      {
        signer: ctl.signing.privateKey,
        key: 'players',
      },
    )
    expect((playerCopy.payload as Ciphertext).k).toBe('s1')
    expect((await open(encodeFrame(playerCopy), player)).ok).toBe(true)
  })

  it('a player holding no staff key cannot derive it from the players root', async () => {
    const ctl = await makeController()
    const { playerKeys } = await contexts(ctl)
    expect(playerKeys.hasStaff).toBe(false)
    expect(playerKeys.root('staff')).toBeUndefined()
    expect(() => playerKeys.sealingKey('staff')).toThrow(/no staff key/)
  })

  it('a staff type under the players key name is WRONG_KEY even when it decrypts', async () => {
    const ctl = await makeController()
    const { staff } = await contexts(ctl)
    // Bypass seal()'s rule to forge what a buggy sender could emit.
    const { name, key } = ctl.keys.sealingKey('players')
    const h = header('eval.assign', { to: `client:${IDS.evaluator}` })
    const nonce = ctl.crypto.random(12)
    const c = await ctl.crypto.aesGcmSeal(
      key,
      nonce,
      new TextEncoder().encode(aadFor(h)),
      new TextEncoder().encode(JSON.stringify(PAYLOAD_FIXTURES['eval.assign'])),
    )
    const ciphertext: Ciphertext = { k: name, n: toBase64Url(nonce), c: toBase64Url(c) }
    const sig = toBase64Url(
      await ctl.crypto.ecdsaSign(
        ctl.signing.privateKey,
        new TextEncoder().encode(`${aadFor(h)}.${ciphertext.k}.${ciphertext.n}.${ciphertext.c}`),
      ),
    )
    const env: Envelope = { ...h, payload: ciphertext, sig }
    expect((await open(encodeFrame(env), staff)) as object).toMatchObject({
      ok: false,
      reason: 'WRONG_KEY',
    })
  })
})

describe('co-controller roster scopes (#440)', () => {
  async function withRoster(ctl: Controller) {
    const co = await ctl.crypto.ecdsaGenerate()
    const roster: ControllerRosterPayload = {
      revision: 1,
      controllers: [
        {
          id: 'metro-transit',
          name: 'Metro Transit',
          publicKey: toBase64Url(co.publicKey),
          scope: { rowPrefixes: ['T-1'], roleIds: ['transit-ops'] },
        },
      ],
    }
    const { player } = await contexts(ctl)
    return { co, ctx: { ...player, roster, scope: new ScopeState() } }
  }
  const release = (over: Partial<(typeof PAYLOAD_FIXTURES)['inject.release']>) => ({
    ...PAYLOAD_FIXTURES['inject.release'],
    ...over,
  })

  it('accepts a co-controller release inside its row prefix and roles', async () => {
    const ctl = await makeController()
    const { co, ctx } = await withRoster(ctl)
    const env = await seal(
      ctl.crypto,
      ctl.keys,
      header('inject.release', { to: 'role:transit-ops' }),
      release({ mselRowId: 'T-1-03', targets: ['role:transit-ops'] }),
      {
        signer: co.privateKey,
        key: 'players',
      },
    )
    const result = await open(encodeFrame(env), ctx)
    expect(result.ok && result.msg.signedBy).toBe('metro-transit')
  })

  it('drops a co-controller release outside its rows or roles as OUT_OF_SCOPE', async () => {
    const ctl = await makeController()
    const { co, ctx } = await withRoster(ctl)
    for (const payload of [
      release({ mselRowId: 'I-03', targets: ['role:transit-ops'] }),
      release({ mselRowId: 'T-10', targets: ['role:transit-ops'] }), // prefix T-1 is a segment, not a string prefix
      release({ mselRowId: 'T-1-03', targets: ['role:transit-ops', 'role:pio'] }),
      release({ mselRowId: 'T-1-03', targets: ['all'] }),
    ]) {
      const env = await seal(ctl.crypto, ctl.keys, header('inject.release'), payload, {
        signer: co.privateKey,
        key: 'players',
      })
      expect((await open(encodeFrame(env), ctx)) as object).toMatchObject({
        ok: false,
        reason: 'OUT_OF_SCOPE',
      })
    }
  })

  it('row prefixes match whole segments', () => {
    expect(rowMatchesPrefix('T-1', 'T-1')).toBe(true)
    expect(rowMatchesPrefix('T-1-03', 'T-1')).toBe(true)
    expect(rowMatchesPrefix('T-1_03', 'T-1')).toBe(true)
    expect(rowMatchesPrefix('T-10', 'T-1')).toBe(false)
    expect(rowMatchesPrefix('T-103', 'T-1')).toBe(false)
    expect(rowMatchesPrefix('T-103', 'T-')).toBe(true)
    expect(rowMatchesPrefix('I-01', 'T-')).toBe(false)
    expect(rowMatchesPrefix('T-1', '')).toBe(false)
  })

  it("a co-controller may close only a vote it opened; the host vote stays the host's", async () => {
    const ctl = await makeController()
    const { co, ctx } = await withRoster(ctl)
    const hostVote = await seal(
      ctl.crypto,
      ctl.keys,
      header('vote.open'),
      PAYLOAD_FIXTURES['vote.open'],
      { signer: ctl.signing.privateKey },
    )
    expect((await open(encodeFrame(hostVote), ctx)).ok).toBe(true)
    const closeHostVote = await seal(
      ctl.crypto,
      ctl.keys,
      header('vote.close', { seq: 2 }),
      PAYLOAD_FIXTURES['vote.close'],
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(closeHostVote), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    })
    const coVoteId = 'co-vote-00000000000000'
    const coVote = await seal(
      ctl.crypto,
      ctl.keys,
      header('vote.open', { to: 'role:transit-ops', seq: 3 }),
      { ...PAYLOAD_FIXTURES['vote.open'], voteId: coVoteId, targets: ['role:transit-ops'] },
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(coVote), ctx)).ok).toBe(true)
    const closeCoVote = await seal(
      ctl.crypto,
      ctl.keys,
      header('vote.close', { to: 'role:transit-ops', seq: 4 }),
      { ...PAYLOAD_FIXTURES['vote.close'], voteId: coVoteId },
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(closeCoVote), ctx)).ok).toBe(true)
    // A close with no known opener (never opened here) is refused too.
    const unknown = await seal(
      ctl.crypto,
      ctl.keys,
      header('survey.close', { seq: 5 }),
      PAYLOAD_FIXTURES['survey.close'],
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(unknown), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    })
  })

  it('a co-controller clock.state or roster is host-only', async () => {
    const ctl = await makeController()
    const { co, ctx } = await withRoster(ctl)
    const clock = await seal(
      ctl.crypto,
      ctl.keys,
      header('clock.state'),
      PAYLOAD_FIXTURES['clock.state'],
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(clock), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    })
    const roster = await seal(
      ctl.crypto,
      ctl.keys,
      header('controller.roster'),
      PAYLOAD_FIXTURES['controller.roster'],
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(roster), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    })
  })

  it('without a roster, only the host key verifies', async () => {
    const ctl = await makeController()
    const { co } = await withRoster(ctl)
    const { player } = await contexts(ctl)
    const env = await seal(
      ctl.crypto,
      ctl.keys,
      header('inject.release'),
      release({ mselRowId: 'T-1-03', targets: ['role:transit-ops'] }),
      {
        signer: co.privateKey,
        key: 'players',
      },
    )
    expect((await open(encodeFrame(env), player)) as object).toMatchObject({
      ok: false,
      reason: 'BAD_SIG',
    })
  })

  it('scope.all admits everything but host-only types', async () => {
    const ctl = await makeController()
    const { co, ctx } = await withRoster(ctl)
    ctx.roster!.controllers[0]!.scope = { all: true, rowPrefixes: [], roleIds: [] }
    const update = await seal(
      ctl.crypto,
      ctl.keys,
      header('hotwash.update'),
      PAYLOAD_FIXTURES['hotwash.update'],
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(update), ctx)).ok).toBe(true)
    const end = await seal(
      ctl.crypto,
      ctl.keys,
      header('session.end'),
      PAYLOAD_FIXTURES['session.end'],
      { signer: co.privateKey },
    )
    expect((await open(encodeFrame(end), ctx)) as object).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    })
  })
})

describe('the noble provider runs the full codec path', () => {
  it('seals, signs, opens, and seals to the controller, interoperating with WebCrypto', async () => {
    const noble = await createNobleProvider()
    const ctl = await makeController(noble)
    const invite = parseInvite(ctl.invite('players'))
    const web = (await import('./crypto/webcrypto')).createWebCryptoProvider()
    const playerKeys = new SessionKeys(invite.sessionId, web, {
      controllerEcdhPub: invite.controllerEcdhPub,
    })
    await playerKeys.addEpoch(invite.epoch, invite.key.kind, invite.key.root)
    // Controller (noble) → player (WebCrypto), signed.
    const clock = await seal(
      noble,
      ctl.keys,
      header('clock.state'),
      PAYLOAD_FIXTURES['clock.state'],
      { signer: ctl.signing.privateKey },
    )
    expect(
      (
        await open(encodeFrame(clock), {
          crypto: web,
          keys: playerKeys,
          controllerPub: ctl.controllerPub,
        })
      ).ok,
    ).toBe(true)
    // Player (WebCrypto) → controller (noble), sealed to the controller.
    const cast = await seal(
      web,
      playerKeys,
      header('vote.cast', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['vote.cast'],
    )
    const opened = await open(encodeFrame(cast), {
      crypto: noble,
      keys: ctl.keys,
      controllerPub: ctl.controllerPub,
    })
    expect(opened.ok && opened.msg.key).toBe('controller')
    // And the whole thing on noble alone.
    const nobleKeys = await keysFromInvite(ctl, 'staff', noble)
    const obs = await seal(
      noble,
      nobleKeys,
      header('eval.observation', { from: IDS.evaluator, to: 'controller' }),
      PAYLOAD_FIXTURES['eval.observation'],
    )
    expect(
      (
        await open(encodeFrame(obs), {
          crypto: noble,
          keys: ctl.keys,
          controllerPub: ctl.controllerPub,
        })
      ).ok,
    ).toBe(true)
  })
})

describe('frames to the controller are bound to the players key (#452)', () => {
  it('a sender holding only the controller ECDH public key, not the session key, cannot seal an acceptable frame', async () => {
    const ctl = await makeController()
    const { controller } = await contexts(ctl)
    // The attacker saw the invite's controller keys but has no root: it makes one up.
    const attacker = new SessionKeys(IDS.session, ctl.crypto, {
      controllerEcdhPub: ctl.keys.controllerEcdhPub,
    })
    await attacker.addEpoch(1, 'players', ctl.crypto.random(32))
    const forged = await seal(
      ctl.crypto,
      attacker,
      header('vote.cast', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['vote.cast'],
    )
    expect((forged.payload as Ciphertext).k).toBe('c')
    expect((await open(encodeFrame(forged), controller)) as object).toMatchObject({
      ok: false,
      reason: 'BAD_TAG',
    })
  })

  it('a frame sealed under the previous epoch still opens on the controller after a rotation', async () => {
    const ctl = await makeController()
    const { controller, playerKeys } = await contexts(ctl)
    const env = await seal(
      ctl.crypto,
      playerKeys,
      header('inject.receipt', { from: IDS.playerA, to: 'controller' }),
      PAYLOAD_FIXTURES['inject.receipt'],
    )
    await ctl.keys.addEpoch(2, 'staff', ctl.crypto.random(32))
    expect(ctl.keys.currentEpoch).toBe(2)
    expect((await open(encodeFrame(env), controller)) as object).toMatchObject({
      ok: true,
      msg: { key: 'controller' },
    })
    // A controller that forgot epoch 1 cannot open it any more.
    ctl.keys.forgetBefore(2)
    expect((await open(encodeFrame(env), controller)) as object).toMatchObject({
      ok: false,
      reason: 'BAD_TAG',
    })
  })
})
