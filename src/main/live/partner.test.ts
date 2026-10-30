// A partner organization as a co-controller (#517), against the local stand-in for the relay: the
// host and a player are real clients of one hub, the partner is `joinPartner`. Checks that the
// partner releases its own rows to its own roles and nothing else, that the host's signed
// roster is the only authority, that receipts come back by role through the host, and that a
// damaged or players-only invite is refused before anything connects.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { LiveClient } from '@shared/live/client'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { buildInvite } from '@shared/live/invite'
import { encodePartnerInvite } from '@shared/live/partner-invite'
import { createRemoteClient } from './transport/remote-client'
import { startTestServer, type TestServer } from './transport/test-remote-server'
import { wsTransport } from './transport/lan/test-clients'
import { forwardReceipt } from './partner-host'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getVersion: () => '0.0.0' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

const scenario = {
  roles: [
    { id: 'ops', name: 'Operations', team: 'Operations' },
    { id: 'pio', name: 'PIO', team: '' },
  ],
  msel: ['AIR-1', 'AIR-2', 'AIR-3', 'OTHER-1'].map((id, i) => ({
    id,
    from: 'Gate agent',
    toRoleIds: id === 'AIR-2' ? ['pio'] : ['ops'],
    event: `Event ${i}`,
    expectedAction: 'Act',
    purposeTag: 'DECISION_POINT',
  })),
}
vi.mock('../scenario/store', () => ({
  getScenario: async () => scenario,
  listInjects: async () => [],
}))
vi.mock('../render/templates', () => ({
  loadTemplate: () => ({ schema: { properties: {} }, meta: { imageSlots: [] } }),
}))

const { joinPartner, leavePartner, partnerStatus, releasePartnerRow } = await import('./partner')

const crypto = createWebCryptoProvider()
const HOST_ID = toBase64Url(new Uint8Array(16).fill(1))
const PLAYER_ID = toBase64Url(new Uint8Array(16).fill(2))

async function until(cond: () => boolean | Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

async function world(permissions?: string[]) {
  const server = await startTestServer({ kind: 'relay' })
  const hostRemote = createRemoteClient({ target: { base: server.base } })
  const created = await hostRemote.create()
  const auth = { sessionId: created.sessionId, controllerToken: created.controllerToken }
  const keys = await SessionKeys.create(crypto, created.sessionId)
  const signing = await crypto.ecdsaGenerate()
  await hostRemote.setJoinToken(auth, await keys.joinTokenHash())
  const host = new LiveClient({
    transport: await hostRemote.connect(auth, HOST_ID),
    keys,
    clientId: HOST_ID,
    role: 'controller',
    crypto,
    controllerPub: signing.publicKey,
    signer: signing.privateKey,
  })
  const partnerKeys = await crypto.ecdsaGenerate()
  const roster = {
    revision: 1,
    controllers: [
      {
        id: 'air',
        name: 'Airport Authority',
        publicKey: toBase64Url(partnerKeys.publicKey),
        scope: {
          rowPrefixes: ['AIR'],
          roleIds: ['ops'],
          ...(permissions ? { permissions } : {}),
        },
      },
    ],
  }
  host.roster = roster as never
  await host.send('controller.roster', 'all', roster as never, { key: 'players' })
  const link = buildInvite({
    base: server.base,
    sessionId: created.sessionId,
    epoch: keys.currentEpoch,
    key: { kind: 'staff', root: keys.root('staff')! },
    controllerPub: signing.publicKey,
    controllerEcdhPub: keys.controllerEcdhPub!,
  })
  const invite = encodePartnerInvite({
    v: 1,
    org: 'air',
    name: 'Airport Authority',
    connection: { kind: 'relay' },
    link,
    controllerToken: await hostRemote.addController(auth),
  })
  const root = mkdtempSync(join(tmpdir(), 'as-partner-'))
  const deps = {
    crypto,
    remoteFor: async () => createRemoteClient({ target: { base: server.base } }),
    keysFor: async () => ({ signer: partnerKeys, name: 'Airport Authority' }),
    now: () => Date.now(),
  }
  return { server, host, keys, signing, created, auth, hostRemote, root, deps, invite, link }
}

type World = Awaited<ReturnType<typeof world>>

async function joined(w: World) {
  await joinPartner(w.root, 'sc', w.invite, w.deps)
  await until(async () => {
    const s = await partnerStatus(w.root, 'sc')
    return s.state === 'joined' && s.scope !== undefined
  })
}

async function player(w: World) {
  const playersKeys = new SessionKeys(w.created.sessionId, crypto, {
    controllerEcdhPub: w.keys.controllerEcdhPub!,
  })
  await playersKeys.addEpoch(w.keys.currentEpoch, 'players', w.keys.root('players')!)
  const ecdh = await crypto.ecdhGenerate()
  const client = new LiveClient({
    transport: await wsTransport(w.server.base, w.created.sessionId, {
      clientId: PLAYER_ID,
      joinToken: await playersKeys.joinToken(),
      resumeToken: new Uint8Array(16).fill(9),
    }),
    keys: playersKeys,
    clientId: PLAYER_ID,
    role: 'participant',
    crypto,
    controllerPub: w.signing.publicKey,
    ecdh,
  })
  client.setDestinations(['all', 'role:ops'])
  client.on('relay.hello', () => client.requestCatchup(0))
  const releases: { signedBy?: string; mselRowId: string }[] = []
  client.on('inject.release', (m) =>
    releases.push({
      ...(m.signedBy ? { signedBy: m.signedBy } : {}),
      mselRowId: m.payload.mselRowId,
    }),
  )
  return { client, releases }
}

let open: World | undefined
afterEach(async () => {
  await leavePartner()
  if (open) {
    open.host.close()
    await open.server.close()
    open = undefined
  }
})

describe('partner as co-controller', () => {
  it('releases its own row to its own role; the player sees the partner’s signature', async () => {
    const w = (open = await world())
    const p = await player(w)
    await joined(w)
    await until(() => p.client.roster !== undefined)
    const summary = await releasePartnerRow(w.root, 'sc', 'AIR-1')
    expect(summary.targets).toEqual(['role:ops'])
    await until(() => p.releases.length === 1)
    expect(p.releases[0]).toEqual({ signedBy: 'air', mselRowId: 'AIR-1' })
    expect(p.client.drops.OUT_OF_SCOPE).toBe(0)
  })

  it('refuses a row outside its prefix, and a recipient outside its roles, before sending', async () => {
    const w = (open = await world())
    const p = await player(w)
    await joined(w)
    await expect(releasePartnerRow(w.root, 'sc', 'OTHER-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    // AIR-2 is addressed to the PIO, a role the roster does not give this organization.
    await expect(releasePartnerRow(w.root, 'sc', 'AIR-2')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(p.releases).toEqual([])
    expect(w.server.hubs.get(w.created.sessionId)!.lastIndex).toBe(1) // only the roster
  })

  it('refuses every release when the roster does not grant the inject permission', async () => {
    const w = (open = await world(['message']))
    await joined(w)
    await expect(releasePartnerRow(w.root, 'sc', 'AIR-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('shows receipts by role, forwarded and signed by the host, and ignores anyone else’s', async () => {
    const w = (open = await world())
    const p = await player(w)
    await joined(w)
    await until(() => p.client.roster !== undefined)
    const summary = await releasePartnerRow(w.root, 'sc', 'AIR-1')
    await until(() => p.releases.length === 1)
    w.host.on('inject.receipt', (m) => {
      void forwardReceipt(
        {
          releases: w.host.scope.releases,
          roleOf: () => 'ops',
          send: (to, payload) =>
            w.host.send('partner.receipt', to, payload as never, { key: 'staff' }),
          log: { append: async () => undefined },
        },
        m.from,
        m.payload,
      )
    })
    await p.client.send('inject.receipt', 'controller', {
      releaseId: summary.releaseId,
      status: 'read',
      at: Date.now(),
    })
    await until(async () => {
      const s = await partnerStatus(w.root, 'sc')
      return s.releases[0]?.counts.read === 1
    })
    const status = await partnerStatus(w.root, 'sc')
    expect(status.releases[0]!.perClient.map((r) => r.seat)).toEqual(['Operations'])
  })

  it('does not forward a receipt for a release a partner did not sign', async () => {
    const w = (open = await world())
    const sent: unknown[] = []
    const forwarded = await forwardReceipt(
      {
        releases: w.host.scope.releases,
        roleOf: () => 'ops',
        send: async (_to, payload) => void sent.push(payload),
        log: { append: async () => undefined },
      },
      PLAYER_ID,
      { releaseId: 'x'.repeat(22), status: 'read', at: 1 },
    )
    expect(forwarded).toBe(false)
    expect(sent).toEqual([])
  })

  it('refuses a damaged invite and a second session without connecting', async () => {
    const w = (open = await world())
    await expect(joinPartner(w.root, 'sc', 'asp1.garbage', w.deps)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await joined(w)
    await expect(joinPartner(w.root, 'sc', w.invite, w.deps)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('reports not joined for a scenario it has no seat in', async () => {
    expect(await partnerStatus('/nowhere', 'sc')).toEqual({ state: 'off', releases: [] })
  })
})

export type { TestServer }
