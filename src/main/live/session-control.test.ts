// Controller actions on a running session (#494): clock.state and staff notices to devices,
// branch decisions in the log, removing a device with a key rotation, and resuming an interrupted
// session from the stored keys.
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveClient } from '@shared/live/client'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { createIdentity } from '@shared/live/identity'
import { parseInvite } from '@shared/live/invite'
import type { Opened } from '@shared/live/codec'
import type { WelcomePayload } from '@shared/live/schemas'
import type { SessionLogEntry } from '@shared/schemas/live'
import { wsTransport } from './transport/lan/test-clients'

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

const {
  startSession,
  endSession,
  status,
  stopLiveSession,
  publishClock,
  sendEvaluatorNotice,
  logBranchEntries,
  liveDevices,
  removeDevice,
  replaceKeys,
  resumeSession,
} = await import('./session')
const { createProject } = await import('../project/store')
const { createScenario, getScenario, saveScenario } = await import('../scenario/store')
const { resetSettingsCache } = await import('../settings/store')
const { ScenarioBrief } = await import('@shared/schemas')

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
async function joinAsPlayer(
  inviteUrl: string,
  name: string,
  requestedRole?: string,
  kind: 'player' | 'evaluator' | 'observer' = 'player',
) {
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
    kind,
    ...(requestedRole ? { requestedRole } : {}),
    ecdhPub: Buffer.from(ecdh.publicKey).toString('base64url'),
  })
  const welcome = await welcomed
  return { client, identity, ended, welcome, keys, ecdh, crypto }
}

const quiet = async () => {
  await stopLiveSession()
  delete process.env.TTX_LIVE_BIND
}

async function startLan() {
  const ctx = await setup()
  const started = await startSession({
    projectPath: ctx.projectPath,
    scenarioId: ctx.scenarioId,
    connection: { kind: 'lan', tls: 'none' },
    attribution: 'role',
  })
  return { ...ctx, started, sessionId: started.session!.id }
}

describe('clock and notices to devices (#428 task 7)', () => {
  afterEach(quiet)

  it('sends clock.state to players when a save moves the clock, once per change, and logs it', async () => {
    const { projectPath, scenarioId, started, sessionId } = await startLan()
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const seen: Opened<'clock.state'>[] = []
    player.client.on('clock.state', (m) => seen.push(m))
    const state = { elapsedMin: 12, runningSince: '2026-10-29T10:00:00.000Z', rate: 2 } as never
    await publishClock(projectPath, scenarioId, state)
    await publishClock(projectPath, scenarioId, state)
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]!.payload).toMatchObject({ elapsedMin: 12, rate: 2 })
    expect(seen[0]!.payload.runningSince).toBe(Date.parse('2026-10-29T10:00:00.000Z'))
    const clockEntries = readLog(projectPath, scenarioId, sessionId).filter(
      (e) => e.kind === 'clock.state',
    )
    expect(clockEntries).toHaveLength(1)
    await endSession(projectPath, scenarioId)
  })

  it('does nothing when no session runs for the scenario', async () => {
    const { projectPath, scenarioId } = await setup()
    await expect(publishClock(projectPath, scenarioId, { elapsedMin: 1 } as never)).resolves.toBe(
      undefined,
    )
  })

  it('sends a staff notice to evaluator devices and never to players', async () => {
    const { projectPath, scenarioId, started, sessionId } = await startLan()
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const evaluator = await joinAsPlayer(
      started.invites!.staff.url,
      'Kim',
      'evaluators',
      'evaluator',
    )
    const toPlayer: string[] = []
    const toEvaluator: Opened<'controller.notice'>[] = []
    player.client.on('controller.notice', (m) => toPlayer.push(m.payload.text))
    evaluator.client.on('controller.notice', (m) => toEvaluator.push(m))
    await sendEvaluatorNotice(projectPath, scenarioId, {
      text: 'I-07 has had no answer for 12 min',
      level: 'warning',
      rowId: 'I-07',
    })
    await vi.waitFor(() => expect(toEvaluator).toHaveLength(1))
    expect(toEvaluator[0]!.payload).toMatchObject({ level: 'warning', ref: 'I-07' })
    expect(toPlayer).toEqual([])
    const notice = readLog(projectPath, scenarioId, sessionId).find(
      (e) => e.kind === 'controller.notice',
    )
    expect(notice?.data).toMatchObject({ to: 'evaluators', level: 'warning' })
    await endSession(projectPath, scenarioId)
  })
})

describe('branch decisions in the live log (#430)', () => {
  afterEach(quiet)

  it('appends decisions and proposals, and leaves releases to delivery', async () => {
    const { projectPath, scenarioId, sessionId } = await startLan()
    await logBranchEntries(projectPath, scenarioId, [
      { kind: 'decision.open', rowId: 'I-05', data: { decisionId: 'D1' } },
      { kind: 'inject.release', rowId: 'I-05', data: {} },
      {
        kind: 'decision.close',
        rowId: 'I-05',
        data: { decisionId: 'D1', chosen: 'B', by: 'vote' },
      },
    ])
    await endSession(projectPath, scenarioId)
    const kinds = readLog(projectPath, scenarioId, sessionId).map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['decision.open', 'decision.close']))
    expect(kinds).not.toContain('inject.release')
  })

  it('does nothing without a running session', async () => {
    const { projectPath, scenarioId } = await setup()
    await expect(
      logBranchEntries(projectPath, scenarioId, [{ kind: 'decision.open', data: {} }]),
    ).resolves.toBe(undefined)
  })
})

describe('removing a device and replacing keys (#410, #417)', () => {
  afterEach(quiet)

  it('closes the removed device, moves the others to epoch 2 and logs both', async () => {
    const { projectPath, scenarioId, started, sessionId } = await startLan()
    const keep = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const drop = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const devices = await liveDevices(projectPath, scenarioId)
    expect(devices.map((d) => d.label).sort()).toEqual(['Operations Director', 'PIO'])
    const target = devices.find((d) => d.label === 'PIO')!
    await removeDevice(projectPath, scenarioId, target.clientRef)
    await vi.waitFor(() => expect(drop.client.state).toBe('closed'))
    await vi.waitFor(() => expect(keep.keys.currentEpoch).toBe(2))
    expect(drop.keys.currentEpoch).toBe(1)
    expect(status(projectPath, scenarioId).invites!.players.epoch).toBe(2)
    expect((await liveDevices(projectPath, scenarioId)).map((d) => d.label)).toEqual([
      'Operations Director',
    ])
    const kinds = readLog(projectPath, scenarioId, sessionId).map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['client.kick', 'key.rotate']))
    await endSession(projectPath, scenarioId)
  })

  it('refuses a device that is not in the session', async () => {
    const { projectPath, scenarioId } = await startLan()
    await expect(removeDevice(projectPath, scenarioId, 'deadbeef')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('replaces the keys with no one removed; the old players link stops opening', async () => {
    const { projectPath, scenarioId, started } = await startLan()
    const old = started.invites!.players.url
    const stay = await joinAsPlayer(old, 'Dana', 'ops')
    expect(await replaceKeys(projectPath, scenarioId)).toBe(2)
    await vi.waitFor(() => expect(stay.keys.currentEpoch).toBe(2))
    expect(stay.client.state).not.toBe('closed')
    // The old link carries the epoch 1 players root; its join token no longer opens the socket.
    const invite = parseInvite(old)
    const keys = new SessionKeys(invite.sessionId, createWebCryptoProvider(), {
      controllerEcdhPub: invite.controllerEcdhPub,
    })
    await keys.addEpoch(invite.epoch, invite.key.kind, invite.key.root)
    const late = await wsTransport(invite.base, invite.sessionId, {
      clientId: 'A'.repeat(22),
      joinToken: await keys.joinToken(),
      resumeToken: new Uint8Array(16).fill(7),
    })
    const closed = await new Promise<number>((resolve) => late.onClose((code) => resolve(code)))
    expect(closed).toBeGreaterThanOrEqual(4000)
    await endSession(projectPath, scenarioId)
  })
})

describe('resuming an interrupted session (#417 FR-7)', () => {
  afterEach(quiet)

  const sessionFile = (ctx: { projectPath: string; scenarioId: string; sessionId: string }) =>
    join(ctx.projectPath, 'scenarios', ctx.scenarioId, 'live', ctx.sessionId, 'session.json')

  const markInterrupted = (file: string) => {
    const session = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    delete session.endedAt
    writeFileSync(file, JSON.stringify(session))
  }

  /** What a crash leaves: the folder without `endedAt` and the stored keys. */
  async function interrupt(ctx: Awaited<ReturnType<typeof startLan>>) {
    const keyFile = join(process.env.TTX_USER_DATA!, 'live', 'sessions', `${ctx.sessionId}.json`)
    const saved = join(tmpdir(), `ttx-keys-${ctx.sessionId}.json`)
    copyFileSync(keyFile, saved)
    await endSession(ctx.projectPath, ctx.scenarioId)
    copyFileSync(saved, keyFile)
    markInterrupted(sessionFile(ctx))
  }

  it('reopens the same session on the same link, logs session.resume and lets devices rejoin', async () => {
    const ctx = await startLan()
    const link = ctx.started.invites!.players.url
    const first = await joinAsPlayer(link, 'Dana', 'ops')
    expect(first.client.state).toBe('joined')
    await interrupt(ctx)
    const resumed = await resumeSession(ctx.projectPath, ctx.scenarioId, ctx.sessionId)
    expect(resumed.session?.id).toBe(ctx.sessionId)
    expect(resumed.invites!.players.url).toBe(link)
    const again = await joinAsPlayer(resumed.invites!.players.url, 'Dana', 'ops')
    expect(again.client.state).toBe('joined')
    const log = readLog(ctx.projectPath, ctx.scenarioId, ctx.sessionId)
    expect(log.map((e) => e.kind)).toContain('session.resume')
    // The device seen before the restart is marked gone; its reference died with the old salt.
    const resumeAt = log.findIndex((e) => e.kind === 'session.resume')
    expect(log.slice(0, resumeAt).some((e) => e.kind === 'client.leave')).toBe(true)
    await endSession(ctx.projectPath, ctx.scenarioId)
  })

  it('keeps the rotated epoch across the restart', async () => {
    const ctx = await startLan()
    await joinAsPlayer(ctx.started.invites!.players.url, 'Dana', 'ops')
    await replaceKeys(ctx.projectPath, ctx.scenarioId)
    await interrupt(ctx)
    const resumed = await resumeSession(ctx.projectPath, ctx.scenarioId, ctx.sessionId)
    expect(resumed.invites!.players.epoch).toBe(2)
    await endSession(ctx.projectPath, ctx.scenarioId)
  })

  it('refuses a session that has ended, and one whose keys are not on this computer', async () => {
    const ctx = await startLan()
    await endSession(ctx.projectPath, ctx.scenarioId)
    await expect(
      resumeSession(ctx.projectPath, ctx.scenarioId, ctx.sessionId),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    markInterrupted(sessionFile(ctx))
    await expect(
      resumeSession(ctx.projectPath, ctx.scenarioId, ctx.sessionId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses while another session runs', async () => {
    const ctx = await startLan()
    await expect(
      resumeSession(ctx.projectPath, ctx.scenarioId, ctx.sessionId),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
