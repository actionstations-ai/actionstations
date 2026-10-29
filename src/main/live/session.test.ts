// The controller-side session host (#407, spec 0418): start on 127.0.0.1, a real participant
// LiveClient joins over the WebSocket with keys from the players link, gets its welcome, the log
// records the join by role with no name or client id, status counts the device, end closes the
// device with session.end and the port, writes endedAt. One session at a time.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveClient, newId } from '@shared/live/client'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { createIdentity } from '@shared/live/identity'
import { parseInvite } from '@shared/live/invite'
import type { WelcomePayload } from '@shared/live/schemas'
import type { SessionLogEntry } from '@shared/schemas/live'
import { httpGet, wsTransport } from './transport/lan/test-clients'

const powerSave = { started: new Set<number>() }
vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getVersion: () => '0.6.0-test',
  },
  BrowserWindow: { getAllWindows: () => [] },
  powerSaveBlocker: {
    start: () => {
      const id = powerSave.started.size + 1
      powerSave.started.add(id)
      return id
    },
    stop: (id: number) => powerSave.started.delete(id),
    isStarted: (id: number) => powerSave.started.has(id),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}))

const { startSession, endSession, status, stopLiveSession, activeSession } =
  await import('./session')
const { createProject } = await import('../project/store')
const { createScenario, getScenario, saveScenario } = await import('../scenario/store')
const { resetSettingsCache } = await import('../settings/store')
const { ScenarioBrief } = await import('@shared/schemas')
const { onEmit } = await import('../lib/events')

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-live-ud-'))
  process.env.TTX_LIVE_BIND = '127.0.0.1'
  process.env.TTX_PLAYER_BUNDLE = join(tmpdir(), 'no-player-bundle-here')
  resetSettingsCache()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-live-proj-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'Rivergate' })
  const s = await createScenario(projectPath, {
    title: 'FIDS failure',
    brief: ScenarioBrief.parse({}),
  })
  const scenario = await getScenario(projectPath, s.id)
  await saveScenario(
    projectPath,
    {
      ...scenario,
      roles: [
        { id: 'ops', name: 'Operations Director', team: 'Operations' },
        { id: 'pio', name: 'PIO', team: 'Communications' },
      ] as never,
    },
    { by: 'user' },
  )
  return { projectPath, scenarioId: s.id }
}

function readLog(projectPath: string, scenarioId: string, sessionId: string): SessionLogEntry[] {
  const path = join(projectPath, 'scenarios', scenarioId, 'live', sessionId, 'log.jsonl')
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as SessionLogEntry)
}

/** A phone: keys from the players link, its own identity, a WebSocket to the LAN server. */
async function joinAsPlayer(inviteUrl: string, name: string, requestedRole?: string) {
  const crypto = createWebCryptoProvider()
  const invite = parseInvite(inviteUrl)
  const keys = new SessionKeys(invite.sessionId, crypto, {
    controllerEcdhPub: invite.controllerEcdhPub,
  })
  await keys.addEpoch(invite.epoch, invite.key.kind, invite.key.root)
  const identity = createIdentity(crypto)
  const ecdh = await crypto.ecdhGenerate()
  const transport = await wsTransport(invite.base, invite.sessionId, {
    clientId: identity.clientId,
    joinToken: await keys.joinToken(),
    resumeToken: identity.resumeToken,
  })
  const client = new LiveClient({
    transport,
    keys,
    clientId: identity.clientId,
    role: 'participant',
    crypto,
    controllerPub: invite.controllerPub,
    ecdh,
  })
  const welcomed = new Promise<WelcomePayload>((resolve) =>
    client.on('welcome', (m) => resolve(m.payload)),
  )
  const ended = new Promise<void>((resolve) => client.on('session.end', () => resolve()))
  await new Promise<void>((resolve) => client.onState((s) => s === 'hello' && resolve()))
  await client.send('join', 'controller', {
    name,
    kind: 'player',
    ...(requestedRole ? { requestedRole } : {}),
    ecdhPub: Buffer.from(ecdh.publicKey).toString('base64url'),
  })
  const welcome = await welcomed
  return { client, identity, ended, welcome, keys, ecdh, crypto }
}

describe('live session host (#407)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  it('starts on the bind address, seats a player over the WebSocket, logs by role, ends cleanly', async () => {
    const { projectPath, scenarioId } = await setup()
    const events: string[] = []
    const off = onEmit((name, payload) => {
      if (name === 'live:changed') events.push((payload as { reason: string }).reason)
    })
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'self-signed' },
      attribution: 'role',
    })
    expect(started.session?.connection).toMatchObject({
      kind: 'lan',
      address: '127.0.0.1',
      tls: 'self-signed',
    })
    expect(started.lan?.fingerprintSha256).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/)
    expect(started.invites?.players.url).toMatch(
      /^https:\/\/127\.0\.0\.1:\d+\/s\/[A-Za-z0-9_-]{22}#/,
    )
    expect(started.invites?.staff.url).not.toBe(started.invites?.players.url)
    expect(started.invites?.players.qr.size).toBeGreaterThanOrEqual(21)
    expect(started.session?.joinUrlPublic).not.toContain('#')
    expect(started.noConnectionsForMs).toBeDefined()
    expect(powerSave.started.size).toBe(1)
    expect(
      existsSync(
        join(process.env.TTX_USER_DATA!, 'live', 'sessions', `${started.session!.id}.json`),
      ),
    ).toBe(true)

    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    expect(player.client.state).toBe('joined')
    const now = status(projectPath, scenarioId)
    expect(now.connected).toBe(1)
    expect(now.noConnectionsForMs).toBeUndefined()

    const sessionId = started.session!.id
    const log = readLog(projectPath, scenarioId, sessionId)
    expect(log.map((e) => e.kind)).toEqual(['session.start', 'client.join'])
    const joinEntry = log[1]!
    expect(joinEntry.actor.seat).toEqual({ kind: 'player', roleId: 'ops' })
    expect(joinEntry.actor.clientRef).toMatch(/^[a-f0-9]{8}$/)
    expect(joinEntry.actor.displayName).toBeUndefined()
    expect(JSON.stringify(log)).not.toContain(player.identity.clientId)
    expect(JSON.stringify(log)).not.toContain('127.0.0.1')

    const origin = started.lan!.url.slice(0, started.lan!.url.indexOf('/s/'))
    const ended = await endSession(projectPath, scenarioId)
    expect(ended.endedAt).toBeDefined()
    await player.ended
    await expect(httpGet(`${origin}/v1/health`)).rejects.toThrow(/ECONNREFUSED/)
    expect(powerSave.started.size).toBe(0)
    expect(activeSession()).toBeUndefined()
    expect(
      existsSync(join(process.env.TTX_USER_DATA!, 'live', 'sessions', `${sessionId}.json`)),
    ).toBe(false)
    const sessionJson = JSON.parse(
      readFileSync(
        join(projectPath, 'scenarios', scenarioId, 'live', sessionId, 'session.json'),
        'utf8',
      ),
    ) as { endedAt?: string }
    expect(sessionJson.endedAt).toBe(ended.endedAt)
    expect(readLog(projectPath, scenarioId, sessionId).at(-1)?.kind).toBe('session.end')
    expect(events).toEqual(expect.arrayContaining(['started', 'presence', 'stopped']))
    expect(status(projectPath, scenarioId)).toEqual({ connected: 0 })
    off()
  })

  it('refuses a second session while one runs and an unknown role, and keeps names when named', async () => {
    const { projectPath, scenarioId } = await setup()
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'named',
    })
    expect(started.lan?.url.startsWith('http://127.0.0.1:')).toBe(true)
    expect(started.lan?.fingerprintSha256).toBeUndefined()
    await expect(
      startSession({
        projectPath,
        scenarioId,
        connection: { kind: 'lan', tls: 'none' },
        attribution: 'role',
      }),
    ).rejects.toThrow(/already running/)
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'pio')
    const log = readLog(projectPath, scenarioId, started.session!.id)
    expect(log[1]?.actor.displayName).toBe('Dana')
    player.client.close()
    const stranger = await joinAsPlayer(started.invites!.players.url, 'Lee', 'nope').catch(
      (e: Error) => e,
    )
    expect(stranger).not.toBeInstanceOf(Error)
    expect((stranger as Awaited<ReturnType<typeof joinAsPlayer>>).client.state).toBe('hello')
    await endSession(projectPath, scenarioId)
  })

  it('answers an empty status for another scenario and NOT_FOUND on ending none', async () => {
    const { projectPath, scenarioId } = await setup()
    expect(status(projectPath, scenarioId)).toEqual({ connected: 0 })
    await expect(endSession(projectPath, scenarioId)).rejects.toThrow(/No live session/)
    expect(newId(createWebCryptoProvider())).toHaveLength(22)
  })
})

describe('join handshake and roster privacy (#411 contract, #457 review L4 and H1)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  it('a first join without a seat gets the lobby (seats, no role); naming a seat gets it; others appear under pseudonyms', async () => {
    const { projectPath, scenarioId } = await setup()
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    const url = started.invites!.players.url
    const lobby = await joinAsPlayer(url, 'Dana')
    expect(lobby.welcome.role).toBeUndefined()
    expect(lobby.welcome.seats?.map((s) => [s.id, s.kind, s.taken])).toEqual([
      ['ops', 'player', 0],
      ['pio', 'player', 0],
      ['evaluators', 'evaluator', 0],
      ['observers', 'observer', 0],
    ])
    // The second join names the seat.
    const seated = new Promise<WelcomePayload>((resolve) =>
      lobby.client.on('welcome', (m) => resolve(m.payload)),
    )
    await lobby.client.send('join', 'controller', {
      name: 'Dana',
      kind: 'player',
      requestedRole: 'ops',
      ecdhPub: Buffer.from(lobby.ecdh.publicKey).toString('base64url'),
    })
    const welcome = await seated
    expect(welcome.role?.id).toBe('ops')
    expect(welcome.seats?.find((s) => s.id === 'ops')?.taken).toBe(1)
    expect(lobby.client.state).toBe('joined')
    // A second device sees the first one's seat under a pseudonym, never its client id.
    const second = await joinAsPlayer(url, 'Lee', 'pio')
    const others = second.welcome.roster.filter((r) => r.roleId === 'ops')
    expect(others).toHaveLength(1)
    expect(others[0]!.client).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(others[0]!.client).not.toBe(lobby.identity.clientId)
    expect(others[0]!.name).toBe('') // role attribution: no names
    // A wrong kind for a seat and a staff seat from a players link are refused.
    const evaluator = await joinAsPlayer(url, 'Eve', 'evaluators')
    expect(evaluator.welcome.rejected?.reason).toBe('not_allowed')
    await endSession(projectPath, scenarioId)
  })

  it('ignores a device that keeps re-joining after twenty joins and logs the flood once', async () => {
    const { projectPath, scenarioId } = await setup()
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    let welcomes = 1
    player.client.on('welcome', () => welcomes++)
    for (let i = 0; i < 25; i++) {
      await player.client.send('join', 'controller', {
        name: 'Dana',
        kind: 'player',
        ecdhPub: Buffer.from(player.ecdh.publicKey).toString('base64url'),
      })
    }
    await new Promise((r) => setTimeout(r, 300))
    expect(welcomes).toBe(20)
    const log = readLog(projectPath, scenarioId, started.session!.id)
    expect(log.filter((e) => e.kind === 'anomaly' && e.data.what === 'join flood')).toHaveLength(1)
    await endSession(projectPath, scenarioId)
  })
})
