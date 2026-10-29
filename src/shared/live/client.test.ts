/**
 * End to end through the in-memory server: the controller app and several devices run the
 * real protocol code with no sockets. The "attack" tests are the security review's proofs of
 * concept turned around: each asserts the attack fails.
 */
import { describe, expect, it } from 'vitest'
import { bytesEqual, toBase64Url } from './bytes'
import { clampLimits, LiveClient, newId } from './client'
import { open, type Opened } from './codec'
import { SessionKeys } from './crypto/keys'
import type { KeyPair } from './crypto/provider'
import { createWebCryptoProvider } from './crypto/webcrypto'
import { IDS, PAYLOAD_FIXTURES } from './fixtures/payloads'
import { makeController, type Controller } from './fixtures/setup'
import { createIdentity, forgetIdentity, loadOrCreateIdentity } from './identity'
import { parseInvite } from './invite'
import { verifyJoin } from './join'
import {
  CLOSE_CODES,
  LIMITS,
  PROTOCOL_VERSION,
  type ConnectionKind,
  type DropReason,
} from './protocol'
import { keyKindFor, type RekeyClient } from './rekey'
import type { ClientKind, Envelope } from './schemas'
import { MemoryKeyValue, type Transport } from './transport'
import { MemoryServer, settle } from './transport-memory'

const crypto = createWebCryptoProvider()

interface Device {
  id: string
  kind: ClientKind
  keys: SessionKeys
  client: LiveClient
  received: Opened[]
  drops: DropReason[]
  ecdh: KeyPair
  resumeToken: Uint8Array
}

async function startRoom(kind: ConnectionKind = 'lan') {
  const connectionKind = kind
  const ctl = await makeController(crypto)
  const server = new MemoryServer({
    sessionId: ctl.sessionId,
    kind,
    joinTokenHash: await ctl.keys.joinTokenHash(),
    crypto,
  })
  const controller = new LiveClient({
    transport: await server.connect({ clientId: IDS.controller, controller: true }),
    keys: ctl.keys,
    clientId: IDS.controller,
    role: 'controller',
    crypto,
    controllerPub: ctl.controllerPub,
    signer: ctl.signing.privateKey,
    kind,
  })
  const inbox: Opened[] = []
  controller.onAny((m) => inbox.push(m))
  /** What the controller believes about each joined device, from `verifyJoin`. */
  const roster = new Map<string, RekeyClient & { claimedStaff: boolean }>()
  controller.on('join', (m) => {
    void verifyJoin(ctl.keys, m).then((v) =>
      roster.set(m.from, {
        clientId: m.from,
        ecdhPub: v.ecdhPub,
        staff: v.staff,
        claimedStaff: v.claimedStaff,
      }),
    )
  })
  const devices: Device[] = []

  /** A device scans the link of its kind, connects with the join token and joins. */
  async function join(
    kind: ClientKind,
    roles: string[] = [],
    over: { url?: string; claim?: ClientKind } = {},
  ): Promise<Device> {
    const invite = parseInvite(over.url ?? ctl.invite(keyKindFor(kind)))
    const keys = new SessionKeys(invite.sessionId, crypto, {
      controllerEcdhPub: invite.controllerEcdhPub,
    })
    await keys.addEpoch(invite.epoch, invite.key.kind, invite.key.root)
    const identity = createIdentity(crypto)
    const ecdh = await crypto.ecdhGenerate()
    const client = new LiveClient({
      transport: await server.connect({
        clientId: identity.clientId,
        joinToken: await keys.joinToken(),
        resumeToken: identity.resumeToken,
      }),
      keys,
      clientId: identity.clientId,
      role: 'participant',
      crypto,
      controllerPub: invite.controllerPub,
      ecdh,
      kind: connectionKind,
    })
    client.setDestinations(roles)
    const device: Device = {
      id: identity.clientId,
      kind,
      keys,
      client,
      received: [],
      drops: [],
      ecdh,
      resumeToken: identity.resumeToken,
    }
    client.onAny((m) => device.received.push(m))
    client.onDropped((r) => device.drops.push(r))
    await settle()
    await client.send('join', 'controller', {
      name: `${kind} ${devices.length + 1}`,
      kind: over.claim ?? kind,
      ecdhPub: toBase64Url(ecdh.publicKey),
    })
    await settle()
    devices.push(device)
    return device
  }

  return { ctl, server, controller, inbox, roster, devices, join }
}

const of = <T extends Opened['type']>(list: Opened[], type: T) =>
  list.filter((m) => m.type === type) as Opened<T>[]
const rawTransport = (client: LiveClient) =>
  (client as unknown as { opts: { transport: Transport } }).opts.transport

describe('LiveClient through the in-memory server', () => {
  it('hello, join, welcome: the controller sees the join and the device reaches joined', async () => {
    const { controller, inbox, join } = await startRoom()
    expect(controller.state).toBe('joined')
    const player = await join('player', ['role:ops-director'])
    expect(player.client.state).toBe('hello')
    expect(of(player.received, 'relay.hello')[0]!.payload.server.kind).toBe('lan')
    expect(player.client.limits).toEqual(LIMITS.lan)
    const joined = of(inbox, 'join')
    expect(joined).toHaveLength(1)
    expect(joined[0]!.from).toBe(player.id)
    expect(joined[0]!.key).toBe('controller')
    expect(joined[0]!.payload.kind).toBe('player')

    await controller.send('welcome', `client:${player.id}`, {
      ...PAYLOAD_FIXTURES.welcome,
      client: player.id,
    })
    await settle()
    expect(player.client.state).toBe('joined')
    expect(of(player.received, 'welcome')[0]!.signedBy).toBe('host')
  })

  it('a device with a bad join token is refused with 4001 and never sees hello', async () => {
    const { server } = await startRoom()
    const closes: number[] = []
    const frames: string[] = []
    const t = await server.connect({
      clientId: newId(crypto),
      joinToken: crypto.random(16),
      resumeToken: crypto.random(16),
    })
    t.onClose((code) => closes.push(code))
    t.onFrame((f) => frames.push(f))
    await settle()
    expect(closes).toEqual([CLOSE_CODES.BAD_JOIN_TOKEN])
    expect(frames.some((f) => (JSON.parse(f) as Envelope).type === 'relay.error')).toBe(true)
    expect(frames.some((f) => (JSON.parse(f) as Envelope).type === 'relay.hello')).toBe(false)
  })

  it('fans an inject out to the room; only the targeted role keeps it, others drop NOT_FOR_ME', async () => {
    const { controller, join } = await startRoom()
    const ops = await join('player', ['role:ops-director'])
    const pio = await join('player', ['role:pio'])
    await controller.send(
      'inject.release',
      'role:ops-director',
      PAYLOAD_FIXTURES['inject.release'],
      { key: 'players' },
    )
    await settle()
    expect(of(ops.received, 'inject.release')).toHaveLength(1)
    expect(of(pio.received, 'inject.release')).toHaveLength(0)
    expect(pio.client.drops.NOT_FOR_ME).toBe(1)
    expect(ops.client.drops.NOT_FOR_ME).toBe(0)
  })

  it('a player device cannot read staff material; an evaluator can, and its observation reaches only the controller', async () => {
    const { controller, inbox, join } = await startRoom()
    const player = await join('player', ['role:ops-director'])
    const evaluator = await join('evaluator', ['role:evaluators'])
    await controller.send('eval.assign', `client:${evaluator.id}`, PAYLOAD_FIXTURES['eval.assign'])
    const staffCopy = {
      ...PAYLOAD_FIXTURES['inject.release'],
      expectedAction: 'Activates the EOC within 15 minutes.',
    }
    await controller.send('inject.release', 'role:evaluators', staffCopy)
    await settle()
    expect(of(evaluator.received, 'eval.assign')).toHaveLength(1)
    expect(of(evaluator.received, 'inject.release')[0]!.payload.expectedAction).toBe(
      staffCopy.expectedAction,
    )
    expect(of(evaluator.received, 'inject.release')[0]!.key).toBe('staff')
    expect(of(player.received, 'inject.release')).toHaveLength(0)
    expect(player.client.drops.STAFF_ONLY).toBe(1)
    expect(player.drops.filter((d) => d !== 'STAFF_ONLY' && d !== 'NOT_FOR_ME')).toEqual([])

    await evaluator.client.send(
      'eval.observation',
      'controller',
      PAYLOAD_FIXTURES['eval.observation'],
    )
    await settle()
    const obs = of(inbox, 'eval.observation')
    expect(obs).toHaveLength(1)
    expect(obs[0]!.key).toBe('controller')
    expect(obs[0]!.from).toBe(evaluator.id)
    expect(of(player.received, 'eval.observation')).toHaveLength(0)
  })

  it('the server refuses controller types from a player connection and keeps the stored log clean', async () => {
    const { controller, join, server } = await startRoom()
    const player = await join('player')
    const errors: Opened<'relay.error'>[] = []
    player.client.on('relay.error', (m) => errors.push(m))
    // A player cannot sign, so forge a frame the way a hostile page would: unsigned clock.state.
    const forged: Envelope = {
      ...(await controller.send('clock.state', 'all', PAYLOAD_FIXTURES['clock.state'])),
      from: player.id,
      seq: 50,
    }
    delete forged.sig
    rawTransport(player.client).send(JSON.stringify(forged))
    await settle()
    expect(errors.map((e) => e.payload.code)).toEqual(['NOT_CONTROLLER'])
    expect(
      server.stored.filter((e) => e.type === 'clock.state' && e.from === player.id),
    ).toHaveLength(0)
  })

  it('the server drops a replayed or lower seq silently; a client guard drops a replay delivered anyway', async () => {
    const { inbox, join, server, controller } = await startRoom()
    const player = await join('player')
    const env = await player.client.send(
      'inject.receipt',
      'controller',
      PAYLOAD_FIXTURES['inject.receipt'],
    )
    await settle()
    const raw = rawTransport(player.client)
    raw.send(JSON.stringify(env))
    raw.send(JSON.stringify({ ...env, seq: env.seq - 1 }))
    await settle()
    expect(of(inbox, 'inject.receipt')).toHaveLength(1)
    expect(server.stored.filter((e) => e.type === 'inject.receipt')).toHaveLength(1)
    // The client guard: hand the controller the stored frame again by hand.
    rawTransport(controller) // (the server never re-sends it; simulate a hostile server)
    const again = await open(env, {
      crypto,
      keys: controller.keys,
      controllerPub: controller.keys.controllerEcdhPub!,
      replay: controller.replay,
    })
    expect(again as object).toMatchObject({ ok: false, reason: 'REPLAY' })
  })

  it("a late joiner catches up on stored frames through the same open() path, with arrival indexes, and never gets its own or others' controller-bound frames", async () => {
    const { controller, join, inbox } = await startRoom()
    const early = await join('player', ['role:ops-director'])
    await controller.send('clock.state', 'all', PAYLOAD_FIXTURES['clock.state'])
    await controller.send(
      'inject.release',
      'role:ops-director',
      PAYLOAD_FIXTURES['inject.release'],
      { key: 'players' },
    )
    await early.client.send('vote.cast', 'controller', PAYLOAD_FIXTURES['vote.cast'])
    await controller.send('vote.open', 'all', PAYLOAD_FIXTURES['vote.open'])
    await settle()
    expect(of(inbox, 'vote.cast')).toHaveLength(1)
    const late = await join('player', ['role:ops-director'])
    late.client.requestCatchup(0)
    await settle()
    const types = late.received.filter((m) => m.index !== undefined).map((m) => [m.type, m.index])
    // Index 1 is early's join and 4 its vote.cast: both to the controller, so the server never hands them out.
    expect(types).toEqual([
      ['clock.state', 2],
      ['inject.release', 3],
      ['vote.open', 5],
    ])
    expect(late.client.lastIndex).toBeGreaterThanOrEqual(5)
    expect(late.client.drops.CONTROLLER_ONLY).toBe(0)
    expect(of(late.received, 'catchup.batch').at(-1)!.payload.done).toBe(true)
  })

  it('a stored frame tampered with on the server fails at that frame and nothing else', async () => {
    const { controller, join, server } = await startRoom()
    await controller.send('clock.state', 'all', PAYLOAD_FIXTURES['clock.state'])
    await controller.send('controller.notice', 'all', PAYLOAD_FIXTURES['controller.notice'], {
      key: 'players',
    })
    await settle()
    const stored = server.stored[0]!
    stored.ts += 1 // the operator edits a header field at rest
    const late = await join('player')
    late.client.requestCatchup(0)
    await settle()
    expect(of(late.received, 'clock.state')).toHaveLength(0)
    expect(of(late.received, 'controller.notice')).toHaveLength(1)
    expect(late.drops.filter((d) => d === 'BAD_SIG' || d === 'BAD_TAG')).toHaveLength(1)
  })

  it('rotation: kicked device reads nothing after it, kept devices and a new-link joiner do', async () => {
    const { ctl, controller, join, server, roster } = await startRoom()
    const a = await join('player', ['role:ops-director'])
    const b = await join('player', ['role:pio'])
    const e = await join('evaluator', ['role:evaluators'])
    await controller.send('clock.state', 'all', {
      ...PAYLOAD_FIXTURES['clock.state'],
      reason: 'start',
    })
    await settle()
    expect(roster.get(e.id)!.staff).toBe(true)
    expect(roster.get(a.id)!.staff).toBe(false)

    const rotation = await controller.rotate([...roster.values()], [b.id])
    await settle()
    server.setJoinTokenHash(await ctl.keys.joinTokenHash())
    server.kick(b.id)
    await settle()
    expect(rotation.epoch).toBe(2)
    expect(a.keys.currentEpoch).toBe(2)
    expect(e.keys.currentEpoch).toBe(2)
    expect(e.keys.hasStaff).toBe(true)
    expect(b.keys.currentEpoch).toBe(1)
    expect(b.client.state).toBe('closed')

    await controller.send('clock.state', 'all', {
      ...PAYLOAD_FIXTURES['clock.state'],
      reason: 'set',
    })
    await controller.send('eval.assign', `client:${e.id}`, PAYLOAD_FIXTURES['eval.assign'])
    await settle()
    expect(of(a.received, 'clock.state').map((m) => m.payload.reason)).toEqual(['start', 'set'])
    expect(of(e.received, 'eval.assign')).toHaveLength(1)
    expect(of(b.received, 'clock.state').map((m) => m.payload.reason)).toEqual(['start'])

    // The old link is refused by the server (join token) and the new one works.
    const oldLinkKeys = new SessionKeys(ctl.sessionId, crypto)
    await oldLinkKeys.addEpoch(1, 'players', a.keys.root('players', 1)!)
    const closes: number[] = []
    const t = await server.connect({
      clientId: newId(crypto),
      joinToken: await oldLinkKeys.joinToken(1),
      resumeToken: crypto.random(16),
    })
    t.onClose((c) => closes.push(c))
    await settle()
    expect(closes).toEqual([CLOSE_CODES.BAD_JOIN_TOKEN])

    const fresh = await join('player', ['role:ops-director'])
    expect(fresh.keys.currentEpoch).toBe(2)
    fresh.client.requestCatchup(0)
    await settle()
    // Epoch-1 history is unreadable; the post-rotation clock is.
    expect(fresh.client.drops.UNKNOWN_EPOCH).toBeGreaterThan(0)
    expect(of(fresh.received, 'clock.state').map((m) => m.payload.reason)).toEqual(['set'])
  })

  it('moves a blob in chunks: put from the controller, get from a player, verified end to end', async () => {
    const { controller, join } = await startRoom('relay')
    const player = await join('player', ['role:ops-director'])
    const bytes = crypto.random(LIMITS.relay.chunkBytes * 2 + 100)
    const ref = await controller.putBlob(
      { kind: 'image', mime: 'image/png', name: 'device' },
      bytes,
    )
    expect(ref.bytes).toBe(bytes.length)
    const got = await player.client.getBlob(ref)
    expect(bytesEqual(got, bytes)).toBe(true)
    await expect(player.client.getBlob({ ...ref, blobId: newId(crypto) })).rejects.toThrow()
  })

  it('refuses an oversize blob at the client before upload and at the server for a player', async () => {
    const { controller, join, server } = await startRoom('relay')
    const player = await join('player')
    await expect(
      controller.putBlob(
        { kind: 'video', mime: 'video/mp4' },
        new Uint8Array(LIMITS.relay.blobBytes + 1),
      ),
    ).rejects.toMatchObject({ code: 'BLOB_TOO_LARGE' })
    await expect(
      player.client.putBlob(
        { kind: 'image', mime: 'image/jpeg' },
        new Uint8Array(LIMITS.relay.playerBlobBytes + 1),
      ),
    ).rejects.toMatchObject({ code: 'BLOB_TOO_LARGE' })
    expect(server.blobs.size).toBe(0)
    // The server enforces the player cap even when a client lies about its role.
    const big = toBase64Url(new Uint8Array(LIMITS.relay.chunkBytes))
    const count = Math.ceil((LIMITS.relay.playerBlobBytes + 1024) / LIMITS.relay.chunkBytes) + 1
    const blobId = newId(crypto)
    const errors: string[] = []
    player.client.on('relay.error', (m) => errors.push(m.payload.code))
    for (let index = 0; index < count; index++)
      await player.client.send('relay.blob.put', 'controller', { blobId, index, count, bytes: big })
    await settle()
    expect(errors).toContain('BLOB_TOO_LARGE')
  })

  it('session.end moves every device to ended and the server forgets the session', async () => {
    const { controller, join, server } = await startRoom()
    const a = await join('player')
    await controller.send('session.end', 'all', PAYLOAD_FIXTURES['session.end'])
    await settle()
    expect(a.client.state).toBe('ended')
    server.end()
    await settle()
    expect(server.stored).toHaveLength(0)
    expect(server.connected).toEqual([])
    await expect(
      a.client.send('vote.cast', 'controller', PAYLOAD_FIXTURES['vote.cast']),
    ).rejects.toThrow(/ended|closed/)
    const closes: number[] = []
    const t = await server.connect({
      clientId: newId(crypto),
      joinToken: await a.keys.joinToken(),
      resumeToken: crypto.random(16),
    })
    t.onClose((c) => closes.push(c))
    await settle()
    expect(closes).toEqual([CLOSE_CODES.SESSION_ENDED])
  })

  it('presence and the hello roster reach the controller only; players learn no other client ids', async () => {
    const { inbox, join, server } = await startRoom()
    const a = await join('player')
    const b = await join('player')
    server.kick(a.id)
    await settle()
    expect(of(inbox, 'presence').map((p) => [p.payload.client, p.payload.state])).toEqual([
      [a.id, 'online'],
      [b.id, 'online'],
      [a.id, 'offline'],
    ])
    expect(of(inbox, 'relay.hello')[0]!.payload.clients).toEqual([
      { client: IDS.controller, since: expect.any(Number) },
    ])
    expect(of(b.received, 'relay.hello')[0]!.payload.clients).toBeUndefined()
    expect(of(b.received, 'presence')).toHaveLength(0)
  })

  it('persists seq across a reconnect with the same resume token and resumes from relay.hello.yourLastSeq', async () => {
    const { ctl, join, server, inbox } = await startRoom()
    const a = await join('player')
    await a.client.send('inject.receipt', 'controller', PAYLOAD_FIXTURES['inject.receipt'])
    await settle()
    const again = new LiveClient({
      transport: await server.connect({
        clientId: a.id,
        joinToken: await a.keys.joinToken(),
        resumeToken: a.resumeToken,
      }),
      keys: a.keys,
      clientId: a.id,
      role: 'participant',
      crypto,
      controllerPub: ctl.controllerPub,
    })
    await settle()
    const env = await again.send('inject.receipt', 'controller', PAYLOAD_FIXTURES['inject.receipt'])
    expect(env.seq).toBe(3) // join (1), receipt (2), then this one
    await settle()
    expect(of(inbox, 'inject.receipt')).toHaveLength(2)
  })
})

describe('attacks from the security review fail', () => {
  it('C1: a players-link device claiming evaluator gets no staff root at rotation and cannot read eval.assign', async () => {
    const { ctl, controller, join, roster, server } = await startRoom()
    const eve = await join('player', [], { claim: 'evaluator' })
    const real = await join('evaluator', ['role:evaluators'])
    await settle()
    expect(eve.keys.hasStaff).toBe(false)
    expect(roster.get(eve.id)).toMatchObject({ claimedStaff: true, staff: false })
    expect(roster.get(real.id)).toMatchObject({ claimedStaff: true, staff: true })
    // A careless controller still passes every join to rotate(); the proven flag decides.
    await controller.rotate([...roster.values()], [])
    await settle()
    expect(eve.keys.currentEpoch).toBe(2)
    expect(eve.keys.hasStaff).toBe(false)
    expect(real.keys.hasStaff).toBe(true)
    await controller.send('eval.assign', `client:${real.id}`, PAYLOAD_FIXTURES['eval.assign'])
    await settle()
    const stored = server.stored.at(-1)!
    expect(stored.type).toBe('eval.assign')
    expect(
      (await open(stored, { crypto, keys: eve.keys, controllerPub: ctl.controllerPub })) as object,
    ).toMatchObject({ ok: false, reason: 'STAFF_ONLY' })
  })

  it('C1: a forged staffProof does not make a device staff', async () => {
    const { ctl, join, server } = await startRoom()
    const invite = parseInvite(ctl.invite('players'))
    const keys = new SessionKeys(invite.sessionId, crypto, {
      controllerEcdhPub: invite.controllerEcdhPub,
    })
    await keys.addEpoch(1, 'players', invite.key.root)
    const identity = createIdentity(crypto)
    const ecdh = await crypto.ecdhGenerate()
    const eve = new LiveClient({
      transport: await server.connect({
        clientId: identity.clientId,
        joinToken: await keys.joinToken(),
        resumeToken: identity.resumeToken,
      }),
      keys,
      clientId: identity.clientId,
      role: 'participant',
      crypto,
      controllerPub: invite.controllerPub,
      ecdh,
    })
    await settle()
    const joins: Opened<'join'>[] = []
    const { controller } = await (async () => ({ controller: (await join('player')).client }))() // a second device, so the room has a controller listener registered before
    void controller
    const envelope = await eve.send('join', 'controller', {
      name: 'Eve',
      kind: 'evaluator',
      ecdhPub: toBase64Url(ecdh.publicKey),
      staffProof: toBase64Url(crypto.random(32)),
    })
    const opened = await open(envelope, {
      crypto,
      keys: ctl.keys,
      controllerPub: ctl.controllerPub,
    })
    expect(opened.ok).toBe(true)
    if (opened.ok) joins.push(opened.msg as Opened<'join'>)
    expect(await verifyJoin(ctl.keys, joins[0]!)).toMatchObject({
      claimedStaff: true,
      staff: false,
    })
  })

  it("H1: catch-up never hands a player another player's controller-bound frames, and the frame is unreadable anyway", async () => {
    const { join, server, ctl } = await startRoom()
    const a = await join('player', ['role:pio'])
    await a.client.send('survey.response', 'controller', PAYLOAD_FIXTURES['survey.response'])
    await a.client.send('vote.cast', 'controller', PAYLOAD_FIXTURES['vote.cast'])
    await a.client.send('hotwash.item', 'controller', PAYLOAD_FIXTURES['hotwash.item'])
    await settle()
    const b = await join('player', ['role:pio'])
    b.client.requestCatchup(0)
    await settle()
    expect(b.received.filter((m) => m.index !== undefined)).toEqual([])
    expect(b.client.drops.CONTROLLER_ONLY).toBe(0)
    // Even a hostile server that hands the stored frames over gets nowhere: sealed to the controller.
    for (const stored of server.stored.filter((e) => e.from === a.id)) {
      expect(
        (await open(stored, { crypto, keys: b.keys, controllerPub: ctl.controllerPub })) as object,
      ).toMatchObject({ ok: false, reason: 'CONTROLLER_ONLY' })
    }
    expect(
      server.stored.filter((e) => e.from === a.id).map((e) => (e.payload as { k: string }).k),
    ).toEqual(['c', 'c', 'c', 'c'])
  })

  it('H2: a join-token holder cannot take over another client id; the owner reconnects with its resume token', async () => {
    const { ctl, server } = await startRoom()
    const victim = createIdentity(crypto)
    const token = await ctl.keys.joinToken()
    await server.connect({
      clientId: victim.clientId,
      joinToken: token,
      resumeToken: victim.resumeToken,
    })
    await settle()
    const closes: number[] = []
    const frames: Envelope[] = []
    const t = await server.connect({
      clientId: victim.clientId,
      joinToken: token,
      resumeToken: crypto.random(16),
    })
    t.onClose((c) => closes.push(c))
    t.onFrame((f) => frames.push(JSON.parse(f) as Envelope))
    await settle()
    expect(closes).toEqual([CLOSE_CODES.CLIENT_ID_IN_USE])
    expect(frames.map((f) => (f.payload as { code?: string }).code)).toEqual(['BAD_RESUME_TOKEN'])
    expect(server.connected).toContain(victim.clientId)
    // No resume token at all is refused too; the controller's id cannot be claimed by a participant.
    const t2 = await server.connect({ clientId: newId(crypto), joinToken: token })
    const closes2: number[] = []
    t2.onClose((c) => closes2.push(c))
    const t3 = await server.connect({
      clientId: IDS.controller,
      joinToken: token,
      resumeToken: crypto.random(16),
    })
    const closes3: number[] = []
    t3.onClose((c) => closes3.push(c))
    await settle()
    expect(closes2).toEqual([CLOSE_CODES.CLIENT_ID_IN_USE])
    expect(closes3).toEqual([CLOSE_CODES.CLIENT_ID_IN_USE])
    // The owner reconnects.
    const t4 = await server.connect({
      clientId: victim.clientId,
      joinToken: token,
      resumeToken: victim.resumeToken,
    })
    const hello: Envelope[] = []
    t4.onFrame((f) => hello.push(JSON.parse(f) as Envelope))
    await settle()
    expect(hello.map((h) => h.type)).toContain('relay.hello')
  })

  it('M1: a controller message to a role without a key is refused rather than defaulting to the players key', async () => {
    const { controller } = await startRoom()
    await expect(
      controller.send('message.send', 'role:pio', PAYLOAD_FIXTURES['message.send']),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
    await expect(
      controller.send('controller.notice', 'all', PAYLOAD_FIXTURES['controller.notice']),
    ).rejects.toMatchObject({ code: 'KEY_RULE' })
  })

  it('M2: hello caps are clamped to the protocol limits and an absurd yourLastSeq is ignored', async () => {
    const ctl = await makeController(crypto)
    const frames: string[] = []
    let deliver: (f: string) => void = () => {}
    const transport: Transport = {
      send: (f) => frames.push(f),
      close: () => {},
      onFrame: (cb) => ((deliver = cb), () => {}),
      onClose: () => () => {},
    }
    const client = new LiveClient({
      transport,
      keys: ctl.keys,
      clientId: IDS.controller,
      role: 'controller',
      crypto,
      controllerPub: ctl.controllerPub,
      signer: ctl.signing.privateKey,
    })
    const hello: Envelope = {
      v: PROTOCOL_VERSION,
      session: ctl.sessionId,
      seq: 0,
      from: 'server',
      to: `client:${IDS.controller}`,
      type: 'relay.hello',
      ts: 1,
      payload: {
        index: 0,
        yourLastSeq: Number.MAX_SAFE_INTEGER - 1,
        server: { kind: 'relay', version: 'x', protocol: [1] },
        caps: {
          envelopeBytes: 2 ** 31,
          chunkBytes: 2 ** 31,
          blobBytes: 2 ** 40,
          playerBlobBytes: 2 ** 40,
          blobsTotalBytes: 2 ** 40,
          clients: 100_000,
        },
      },
    }
    deliver(JSON.stringify(hello))
    await settle()
    expect(client.limits).toEqual(LIMITS.relay)
    const env = await client.send('clock.state', 'all', PAYLOAD_FIXTURES['clock.state'])
    expect(env.seq).toBe(1)
    expect(clampLimits({ ...LIMITS.lan, chunkBytes: 10 }, 'lan').chunkBytes).toBe(10)
  })

  it('L2: a nested catch-up batch or a server frame inside a batch is dropped, not applied', async () => {
    const ctl = await makeController(crypto)
    let deliver: (f: string) => void = () => {}
    const transport: Transport = {
      send: () => {},
      close: () => {},
      onFrame: (cb) => ((deliver = cb), () => {}),
      onClose: () => () => {},
    }
    const client = new LiveClient({
      transport,
      keys: ctl.keys,
      clientId: IDS.controller,
      role: 'controller',
      crypto,
      controllerPub: ctl.controllerPub,
      signer: ctl.signing.privateKey,
    })
    const seen: Opened[] = []
    client.onAny((m) => seen.push(m))
    const server = (type: Envelope['type'], payload: Record<string, unknown>): Envelope => ({
      v: PROTOCOL_VERSION,
      session: ctl.sessionId,
      seq: 0,
      from: 'server',
      to: `client:${IDS.controller}`,
      type,
      ts: 1,
      payload,
    })
    const inner = server('catchup.batch', { from: 0, to: 0, entries: [], done: true })
    const presence = server('presence', PAYLOAD_FIXTURES.presence as Record<string, unknown>)
    deliver(
      JSON.stringify(
        server('catchup.batch', {
          from: 0,
          to: 2,
          entries: [
            { i: 1, e: inner },
            { i: 2, e: presence },
          ],
          done: true,
        }),
      ),
    )
    await settle()
    expect(seen.map((m) => m.type)).toEqual(['catchup.batch'])
    expect(client.drops.PARSE).toBe(2)
  })

  it('L2: a live frame that arrives during a catch-up waits, so the stored frame is not dropped as a replay', async () => {
    const { controller, join, server } = await startRoom()
    await controller.send('clock.state', 'all', {
      ...PAYLOAD_FIXTURES['clock.state'],
      reason: 'start',
    })
    await settle()
    const late = await join('player')
    late.client.requestCatchup(0)
    // Before the batch is processed, a newer live frame from the same sender lands.
    await controller.send('clock.state', 'all', {
      ...PAYLOAD_FIXTURES['clock.state'],
      reason: 'pause',
    })
    await settle()
    expect(of(late.received, 'clock.state').map((m) => m.payload.reason)).toEqual([
      'start',
      'pause',
    ])
    expect(late.client.drops.REPLAY).toBe(0)
    expect(server.stored).toHaveLength(3)
  })
})

describe('client identity', () => {
  it('is created once per session in storage and forgotten on request', () => {
    const storage = new MemoryKeyValue()
    const a = loadOrCreateIdentity(crypto, storage, IDS.session)
    const b = loadOrCreateIdentity(crypto, storage, IDS.session)
    expect(b.clientId).toBe(a.clientId)
    expect(bytesEqual(b.resumeToken, a.resumeToken)).toBe(true)
    expect(a.resumeToken).toHaveLength(16)
    forgetIdentity(storage, IDS.session)
    expect(loadOrCreateIdentity(crypto, storage, IDS.session).clientId).not.toBe(a.clientId)
    storage.set(`as-live:${IDS.session}:identity`, 'garbage')
    expect(loadOrCreateIdentity(crypto, storage, IDS.session).resumeToken).toHaveLength(16)
  })
})

/** Keeps the Controller type referenced for the helpers above. */
export type _RoomController = Controller

/** A client over a hand-driven transport: the test plays the server. */
function handDriven() {
  const frames: string[] = []
  let deliver: (f: string) => void = () => {}
  const transport: Transport = {
    send: (f) => frames.push(f),
    close: () => {},
    onFrame: (cb) => ((deliver = cb), () => {}),
    onClose: () => () => {},
  }
  return { frames, transport, deliver: (f: string) => deliver(f) }
}

function helloFrom(
  sessionId: string,
  to: string,
  kind: ConnectionKind,
  caps = LIMITS[kind],
): string {
  const hello: Envelope = {
    v: PROTOCOL_VERSION,
    session: sessionId,
    seq: 0,
    from: 'server',
    to: `client:${to}`,
    type: 'relay.hello',
    ts: 1,
    payload: { index: 0, yourLastSeq: 0, server: { kind, version: 'x', protocol: [1] }, caps },
  }
  return JSON.stringify(hello)
}

describe('hardening from the #449 re-review (#452)', () => {
  it('a server claiming to be a LAN server cannot raise the caps of a client that chose the relay', async () => {
    const ctl = await makeController(crypto)
    const { transport, deliver } = handDriven()
    const client = new LiveClient({
      transport,
      keys: ctl.keys,
      clientId: IDS.controller,
      role: 'controller',
      crypto,
      controllerPub: ctl.controllerPub,
      signer: ctl.signing.privateKey,
      kind: 'relay',
    })
    deliver(helloFrom(ctl.sessionId, IDS.controller, 'lan'))
    await settle()
    expect(client.limits).toEqual(LIMITS.relay)
    // A client built with explicit limits (the app's LAN controller) is capped by those.
    const { transport: t2, deliver: d2 } = handDriven()
    const lan = new LiveClient({
      transport: t2,
      keys: ctl.keys,
      clientId: IDS.controller,
      role: 'controller',
      crypto,
      controllerPub: ctl.controllerPub,
      signer: ctl.signing.privateKey,
      limits: LIMITS.lan,
    })
    d2(helloFrom(ctl.sessionId, IDS.controller, 'self-hosted', LIMITS['self-hosted']))
    await settle()
    expect(lan.limits.blobBytes).toBe(LIMITS['self-hosted'].blobBytes) // under the LAN ceiling
    expect(lan.limits.playerBlobBytes).toBe(LIMITS.lan.playerBlobBytes) // over it: clamped
    d2(helloFrom(ctl.sessionId, IDS.controller, 'lan', { ...LIMITS.lan, envelopeBytes: 2 ** 30 }))
    await settle()
    expect(lan.limits.envelopeBytes).toBe(LIMITS.lan.envelopeBytes)
    expect(clampLimits({ ...LIMITS.lan, clients: 9 }, LIMITS.relay).clients).toBe(9)
  })

  it('the held-back buffer is released at its frame cap when a server never finishes the catch-up', async () => {
    const ctl = await makeController(crypto)
    const { transport, deliver } = handDriven()
    const client = new LiveClient({
      transport,
      keys: ctl.keys,
      clientId: IDS.controller,
      role: 'controller',
      crypto,
      controllerPub: ctl.controllerPub,
      signer: ctl.signing.privateKey,
      kind: 'lan',
      heldBack: { maxFrames: 5, timeoutMs: 60_000 },
    })
    deliver(helloFrom(ctl.sessionId, IDS.controller, 'lan'))
    await settle()
    client.requestCatchup(0)
    // Live frames from a peer (not server frames) arrive; the catch-up never says done.
    for (let i = 0; i < 4; i++) deliver(`{"bogus":${i}}`)
    await settle()
    expect(client.drops.PARSE).toBe(0) // still held
    deliver('{"bogus":4}')
    await settle()
    expect(client.drops.PARSE).toBe(5) // released and applied (and dropped as garbage)
    deliver('{"bogus":5}')
    await settle()
    expect(client.drops.PARSE).toBe(6) // no longer holding
    client.close()
  })

  it('the held-back buffer is released at its byte cap and after the timeout', async () => {
    const ctl = await makeController(crypto)
    const { transport, deliver } = handDriven()
    const client = new LiveClient({
      transport,
      keys: ctl.keys,
      clientId: IDS.controller,
      role: 'controller',
      crypto,
      controllerPub: ctl.controllerPub,
      signer: ctl.signing.privateKey,
      kind: 'lan',
      heldBack: { maxFrames: 1000, maxBytes: 100, timeoutMs: 30 },
    })
    deliver(helloFrom(ctl.sessionId, IDS.controller, 'lan'))
    await settle()
    client.requestCatchup(0)
    deliver(`{"pad":"${'x'.repeat(120)}"}`)
    await settle()
    expect(client.drops.PARSE).toBe(1) // over 100 bytes: released at once
    client.requestCatchup(0)
    deliver('{"bogus":1}')
    await settle()
    expect(client.drops.PARSE).toBe(1) // held
    await new Promise((r) => setTimeout(r, 60))
    expect(client.drops.PARSE).toBe(2) // the timeout released it
    expect(client.state).toBe('joined')
    client.close()
  })
})
