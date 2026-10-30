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
import type { Opened } from '@shared/live/codec'
import type { WelcomePayload } from '@shared/live/schemas'
import { Survey } from '@shared/schemas'
import { VoteDefinition, type SessionLogEntry } from '@shared/schemas/live'
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

const {
  startSession,
  endSession,
  status,
  stopLiveSession,
  activeSession,
  releaseInject,
  releaseSummaries,
  retractInject,
  sendMessage,
  messageThreads,
  messageThread,
  pinMessage,
  openVote,
  closeVote,
  listVotes,
  onVoteClosed,
  recordVote,
  voteScope,
  openHotwash,
  closeHotwash,
  hotwashBoard,
  updateHotwash,
  promoteHotwash,
  openSurvey,
  closeSurvey,
  liveSurveys,
} = await import('./session')
const { writeSurvey, readResponses } = await import('../surveys/store')
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

describe('inject delivery through a running session (#412)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  async function withRow() {
    const { projectPath, scenarioId } = await setup()
    const scenario = await getScenario(projectPath, scenarioId)
    await saveScenario(
      projectPath,
      {
        ...scenario,
        msel: [
          {
            id: 'I-01',
            phaseId: 'p1',
            time: '0:30',
            from: 'Gate agent',
            toRoleIds: ['ops'],
            event: 'The FIDS boards go dark.',
            expectedAction: 'Call the duty manager',
            purposeTag: 'DECISION_POINT',
            citations: [],
            locked: false,
          },
        ] as never,
      },
      { by: 'user' },
    )
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    return { projectPath, scenarioId, started }
  }

  it('sends a release to the seat it is for, takes its receipts, and withdraws it', async () => {
    const { projectPath, scenarioId, started } = await withRow()
    const ops = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const pio = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const opsGot = new Promise<Opened<'inject.release'>>((r) => ops.client.on('inject.release', r))
    const opsRecall = new Promise<Opened<'inject.recall'>>((r) => ops.client.on('inject.recall', r))

    const summary = await releaseInject(projectPath, scenarioId, { rowId: 'I-01' })
    const msg = await opsGot
    expect(msg.to).toBe('role:ops')
    expect(msg.payload).toMatchObject({
      mselRowId: 'I-01',
      sender: 'Gate agent',
      targets: ['role:ops'],
      text: { body: 'The FIDS boards go dark.' },
    })
    expect(msg.payload).not.toHaveProperty('expectedAction')

    const send = (c: typeof ops, status: 'delivered' | 'read') =>
      c.client.send('inject.receipt', 'controller', {
        releaseId: summary.releaseId,
        status,
        at: Date.now(),
      })
    await send(ops, 'delivered')
    await send(ops, 'read')
    await send(pio, 'read')
    await vi.waitFor(async () => {
      const [s] = await releaseSummaries(projectPath, scenarioId)
      expect(s!.counts).toEqual({ to: 1, delivered: 1, read: 1, actioned: 0 })
    })

    await retractInject(projectPath, scenarioId, summary.releaseId)
    expect((await opsRecall).payload).toMatchObject({ reason: 'withdrawn' })
    const log = readLog(projectPath, scenarioId, started.session!.id)
    expect(log.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['inject.release', 'inject.receipt', 'inject.retract', 'anomaly']),
    )
    expect(log.filter((e) => e.kind === 'inject.receipt')).toHaveLength(2)
    expect(JSON.stringify(log)).not.toContain(ops.identity.clientId)
    await endSession(projectPath, scenarioId)
  })
})

describe('messages through a running session (#413)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7])

  async function running() {
    const { projectPath, scenarioId } = await setup()
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    return { projectPath, scenarioId, started }
  }

  it('takes a PIO message with a photo, echoes it to the seat only, answers in character, and logs it', async () => {
    const { projectPath, scenarioId, started } = await running()
    const pio = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const pioSecond = await joinAsPlayer(started.invites!.players.url, 'Lee', 'pio')
    const ops = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    pio.client.setDestinations(['all', 'role:pio'])
    pioSecond.client.setDestinations(['all', 'role:pio'])
    ops.client.setDestinations(['all', 'role:ops'])
    const seen: Record<string, Opened<'message.send'>[]> = { pio: [], second: [], ops: [] }
    pio.client.on('message.send', (m) => seen.pio!.push(m))
    pioSecond.client.on('message.send', (m) => seen.second!.push(m))
    ops.client.on('message.send', (m) => seen.ops!.push(m))

    const photo = await pio.client.putBlob({ kind: 'image', mime: 'image/png' }, PNG)
    const messageId = newId(pio.crypto)
    await pio.client.send('message.send', 'controller', {
      messageId,
      channel: 'role:pio',
      text: 'We are investigating a systems issue.',
      attachments: [photo],
    })
    await vi.waitFor(() => expect(seen.second).toHaveLength(1))
    expect(seen.pio![0]!.payload).toMatchObject({ echoOf: messageId, fromRole: 'pio' })
    expect(seen.pio![0]!.signedBy).toBe('host')

    await sendMessage(projectPath, scenarioId, {
      channel: 'role:pio',
      text: 'Can you confirm ransomware?',
      persona: 'Channel 5 newsroom',
      showPlayedBy: true,
    })
    await vi.waitFor(() => expect(seen.second).toHaveLength(2))
    expect(seen.second![1]!.payload).toMatchObject({
      persona: 'Channel 5 newsroom',
      showPlayedBy: true,
    })
    expect(seen.ops).toEqual([])

    const [thread] = messageThreads(projectPath, scenarioId)
    expect(thread).toMatchObject({ channel: 'role:pio', messages: 2, unread: 1 })
    const [first] = messageThread(projectPath, scenarioId, 'role:pio')
    expect(first!.attachments[0]!.path).toMatch(/attachments\/.+\.png$/)
    await pinMessage(projectPath, scenarioId, first!.messageId)

    const log = readLog(projectPath, scenarioId, started.session!.id)
    expect(log.map((e) => e.kind)).toEqual(expect.arrayContaining(['message', 'message.pinned']))
    const mine = log.find((e) => e.kind === 'message' && e.actor.kind === 'client')!
    expect(mine.actor).toMatchObject({ seat: { roleId: 'pio' } })
    expect(mine.actor.displayName).toBeUndefined()
    expect(mine.ex).toBeDefined()
    expect(JSON.stringify(log)).not.toContain(pio.identity.clientId)
    await endSession(projectPath, scenarioId)
  })

  it('drops a message to another role and logs an anomaly', async () => {
    const { projectPath, scenarioId, started } = await running()
    const ops = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    await ops.client.send('message.send', 'controller', {
      messageId: newId(ops.crypto),
      channel: 'role:pio',
      text: 'Hello from the wrong seat',
      attachments: [],
    })
    await vi.waitFor(() => {
      const log = readLog(projectPath, scenarioId, started.session!.id)
      expect(log.some((e) => e.kind === 'anomaly' && JSON.stringify(e.data).includes('own'))).toBe(
        true,
      )
    })
    expect(messageThreads(projectPath, scenarioId)).toEqual([])
    await endSession(projectPath, scenarioId)
  })
})

describe('hot wash contributions through a running session (#415)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  const post = (
    p: Awaited<ReturnType<typeof joinAsPlayer>>,
    over: Record<string, unknown> = {},
  ): Promise<string> => {
    const itemId = newId(p.crypto)
    return p.client
      .send('hotwash.item', 'controller', {
        itemId,
        kind: 'improvement',
        text: 'Two incident numbers',
        anonymous: false,
        ...over,
      } as never)
      .then(() => itemId)
  }

  it('opens, takes role and anonymous items, counts +1, groups and promotes, and logs without seats on anonymous ones', async () => {
    const { projectPath, scenarioId } = await setup()
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    const ops = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const pio = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const pioSecond = await joinAsPlayer(started.invites!.players.url, 'Lee', 'pio')
    expect(ops.welcome.features.hotwash).toBe(true)
    expect(ops.welcome.hotwash?.method).toBe('3up3down')

    const updates: Opened<'hotwash.update'>[] = []
    const notices: string[] = []
    pioSecond.client.on('hotwash.update', (m) => updates.push(m))
    pioSecond.client.on('controller.notice', (m) => notices.push(m.payload.kind))

    await openHotwash(projectPath, scenarioId, false)
    await vi.waitFor(() => expect(notices).toEqual(['hotwash.open']))

    const roleItem = await post(ops)
    const anonItem = await post(pio, { anonymous: true, text: 'No FBI number in the plan' })
    await vi.waitFor(() =>
      expect(updates.filter((u) => u.payload.action === 'accept')).toHaveLength(2),
    )
    const accepted = updates.map((u) => u.payload)
    expect(accepted[0]).toMatchObject({ itemId: roleItem, roleId: 'ops' })
    expect(accepted[1]).toMatchObject({ itemId: anonItem, text: 'No FBI number in the plan' })
    expect(accepted[1]).not.toHaveProperty('roleId')
    expect(updates[0]!.signedBy).toBe('host')

    await post(pioSecond, { plusOneOf: roleItem, text: '', anonymous: true })
    await vi.waitFor(() =>
      expect(updates.at(-1)!.payload).toMatchObject({ action: 'tag', plus: 1 }),
    )

    await updateHotwash(projectPath, scenarioId, {
      action: 'group',
      itemIds: [roleItem, anonItem],
      label: 'Incident numbering',
    })
    const { entry, board } = await promoteHotwash(projectPath, scenarioId, roleItem)
    expect(entry).toMatchObject({
      kind: 'improvement',
      text: 'Incident numbering (2 contributions)',
    })
    expect(entry.id).toMatch(/^dev-/)
    expect(board.groups[0]).toMatchObject({ label: 'Incident numbering', promoted: true })
    await vi.waitFor(() =>
      expect(updates.filter((u) => u.payload.action === 'promote')).toHaveLength(2),
    )

    await closeHotwash(projectPath, scenarioId)
    await vi.waitFor(() => expect(notices).toEqual(['hotwash.open', 'hotwash.close']))
    // Closed: a new item is dropped and logged, never shown.
    await post(ops, { text: 'Too late' })
    await vi.waitFor(() => {
      const log = readLog(projectPath, scenarioId, started.session!.id)
      expect(
        log.some((e) => e.kind === 'anomaly' && JSON.stringify(e.data).includes('closed')),
      ).toBe(true)
    })
    expect(hotwashBoard(projectPath, scenarioId).items).toHaveLength(2)

    const log = readLog(projectPath, scenarioId, started.session!.id)
    const items = log.filter((e) => e.kind === 'hotwash.item')
    expect(items).toHaveLength(2)
    expect(items[0]!.actor.seat).toEqual({ kind: 'player', roleId: 'ops' })
    expect(items[1]!.actor.seat).toBeUndefined()
    expect(log.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['hotwash.open', 'hotwash.plus', 'hotwash.promoted', 'hotwash.close']),
    )
    expect(JSON.stringify(log)).not.toContain(pio.identity.clientId)
    await endSession(projectPath, scenarioId)
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

describe('decision-point votes through a running session (#414)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  type Player = Awaited<ReturnType<typeof joinAsPlayer>>

  /** Retries until the hub's events have landed; the default 1 s is too short under CI load. */
  const settled = (check: () => void | Promise<void>) =>
    vi.waitFor(check, { timeout: 15_000, interval: 20 })

  /** Four devices over the WebSocket (the host allows four per address): two Ops, a PIO and IT. */
  async function room() {
    const { projectPath, scenarioId } = await setup()
    const scenario = await getScenario(projectPath, scenarioId)
    await saveScenario(
      projectPath,
      {
        ...scenario,
        roles: [...scenario.roles, { id: 'it', name: 'IT Director', team: 'IT' }] as never,
      },
      { by: 'user' },
    )
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    const url = started.invites!.players.url
    const seats = ['ops', 'ops', 'pio', 'it']
    const players: Player[] = []
    for (const [i, seat] of seats.entries()) {
      const p = await joinAsPlayer(url, `P${i}`, seat)
      p.client.setDestinations(['all', `role:${seat}`])
      players.push(p)
    }
    return { projectPath, scenarioId, started, players }
  }

  const heard = (players: Player[]) => {
    const opens = players.map(() => [] as Opened<'vote.open'>[])
    const closes = players.map(() => [] as Opened<'vote.close'>[])
    players.forEach((p, i) => {
      p.client.on('vote.open', (m) => opens[i]!.push(m))
      p.client.on('vote.close', (m) => closes[i]!.push(m))
    })
    return { opens, closes }
  }

  it('opens to every device, takes sealed ballots with a change, and closes with a tally', async () => {
    const { projectPath, scenarioId, started, players } = await room()
    const { opens, closes } = heard(players)
    const closed: unknown[] = []
    const off = onVoteClosed((r) => closed.push(r))
    const def = VoteDefinition.parse({ question: 'Shut down FIDS?', options: ['Yes', 'No'] })
    const vote = await openVote(projectPath, scenarioId, def, 'I-14')
    await settled(() => expect(opens.every((o) => o.length === 1)).toBe(true))
    expect(opens[0]![0]!.payload).toMatchObject({
      voteId: vote.voteId,
      question: 'Shut down FIDS?',
    })
    expect(opens[0]![0]!.signedBy).toBe('host')

    const choose = (i: number, optionId: string) =>
      players[i]!.client.send('vote.cast', 'controller', { voteId: vote.voteId, optionId })
    for (const i of [0, 1, 2]) await choose(i, 'o1')
    await choose(3, 'o1')
    await choose(3, 'o2')
    await choose(2, 'o2')
    await settled(async () =>
      expect((await listVotes(projectPath, scenarioId))[0]!.options.map((o) => o.count)).toEqual([
        2, 2,
      ]),
    )
    const done = await closeVote(projectPath, scenarioId, vote.voteId)
    expect(done).toMatchObject({ status: 'closed', voted: 4, eligible: 4 })
    await settled(() => expect(closes.every((c) => c.length === 1)).toBe(true))
    expect(closes[0]![0]!.payload).toMatchObject({ status: 'closed', voted: 4, reveal: true })
    expect(closed).toHaveLength(1)
    off()

    const decision = await recordVote(projectPath, scenarioId, vote.voteId)
    expect(decision.text).toMatch(/^Tied: Yes and No \(2 each of 4\), vote at \d+:\d\d$/)
    expect(decision.rowId).toBe('I-14')

    const log = readLog(projectPath, scenarioId, started.session!.id)
    const casts = log.filter((e) => e.kind === 'vote.cast')
    expect(casts).toHaveLength(6)
    for (const e of casts) {
      expect(e.actor).toEqual({ kind: 'client' })
      expect(e.data).not.toHaveProperty('role')
    }
    const text = JSON.stringify(log)
    for (const p of players) expect(text).not.toContain(p.identity.clientId)
    await endSession(projectPath, scenarioId)
  })

  it('a by-role vote folds the lone PIO and IT devices into Other under k = 2', async () => {
    const { projectPath, scenarioId, started, players } = await room()
    const scope = voteScope(projectPath, scenarioId, ['all'], 2)
    expect(scope.smallRoles.map((r) => `${r.label}:${r.devices}`).sort()).toEqual([
      'IT Director:1',
      'PIO:1',
    ])
    const def = VoteDefinition.parse({
      question: 'Declare an incident?',
      options: ['Yes', 'No'],
      anonymous: false,
      k: 2,
    })
    const vote = await openVote(projectPath, scenarioId, def)
    const optionFor = ['o1', 'o1', 'o2', 'o2']
    for (const [i, p] of players.entries())
      await p.client.send('vote.cast', 'controller', {
        voteId: vote.voteId,
        optionId: optionFor[i]!,
      })
    await settled(async () => expect((await listVotes(projectPath, scenarioId))[0]!.voted).toBe(4))
    const done = await closeVote(projectPath, scenarioId, vote.voteId)
    expect(done.byRole).toEqual(
      expect.arrayContaining([
        { roleId: 'ops', label: 'Operations Director', optionId: 'o1', count: 2 },
        { roleId: 'other', label: 'Other', optionId: 'o2', count: 2 },
      ]),
    )
    expect(done.byRole!.some((r) => r.roleId === 'pio' || r.roleId === 'it')).toBe(false)
    const log = readLog(projectPath, scenarioId, started.session!.id)
    const roles = log.filter((e) => e.kind === 'vote.cast').map((e) => e.data.role)
    expect(roles.filter((r) => r === 'other')).toHaveLength(2)
    expect(JSON.stringify(log)).not.toMatch(/"role":"(pio|it)"/)
    await endSession(projectPath, scenarioId)
  })

  it('counts a ballot after close as late, and closes an open vote as interrupted when the session ends', async () => {
    const { projectPath, scenarioId, started, players } = await room()
    const def = VoteDefinition.parse({ question: 'Last call?', options: ['Yes', 'No'] })
    const first = await openVote(projectPath, scenarioId, def)
    await closeVote(projectPath, scenarioId, first.voteId)
    await players[0]!.client.send('vote.cast', 'controller', {
      voteId: first.voteId,
      optionId: 'o1',
    })
    await settled(() =>
      expect(
        readLog(projectPath, scenarioId, started.session!.id).some(
          (e) => e.kind === 'anomaly' && e.data.what === 'vote late',
        ),
      ).toBe(true),
    )
    expect((await listVotes(projectPath, scenarioId))[0]).toMatchObject({ voted: 0 })

    const second = await openVote(projectPath, scenarioId, def)
    await players[1]!.client.send('vote.cast', 'controller', {
      voteId: second.voteId,
      optionId: 'o2',
    })
    await settled(async () => expect((await listVotes(projectPath, scenarioId))[0]!.voted).toBe(1))
    await endSession(projectPath, scenarioId)
    const log = readLog(projectPath, scenarioId, started.session!.id)
    const close = log.filter((e) => e.kind === 'vote.close').at(-1)!
    expect(close.data).toMatchObject({ status: 'interrupted', voted: 1 })
  })
})

describe('evaluator observations through a running session (#416)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  const evaluation = {
    objectiveCapabilities: [],
    eegs: [
      {
        capability: 'operational_communications',
        target: '',
        objectiveRefs: [],
        criticalTasks: [
          {
            id: 'T-01',
            capability: 'operational_communications',
            task: 'Notify the airlines within 15 minutes',
            citation: { documentId: 'd1', documentTitle: 'AEP', headingPath: 'AEP > App. 6' },
            rowIds: ['I-01'],
            objectiveRefs: [],
            locked: false,
          },
        ],
      },
    ],
  }

  it('sends the assignment to the evaluator only, takes an observation into evaluation.json and the log', async () => {
    const { projectPath, scenarioId } = await setup()
    await saveScenario(
      projectPath,
      { ...(await getScenario(projectPath, scenarioId)), evaluation } as never,
      { by: 'user' },
    )
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    const player = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const seenByPlayer: string[] = []
    player.client.on('eval.assign', (m) => seenByPlayer.push(m.type))
    const evaluator = await joinAsPlayer(
      started.invites!.staff.url,
      'Kim',
      'evaluators',
      'evaluator',
    )
    const assigned: Opened<'eval.assign'>[] = []
    evaluator.client.on('eval.assign', (m) => assigned.push(m))
    await vi.waitFor(() => expect(assigned.length).toBeGreaterThan(0))
    expect(assigned.at(-1)!.payload).toMatchObject({ label: 'Evaluator 1', showExpected: true })
    expect(assigned.at(-1)!.payload.tasks[0]).toMatchObject({ id: 'T-01', rowIds: ['I-01'] })
    expect(assigned.at(-1)!.signedBy).toBe('host')

    await evaluator.client.send('eval.observation', 'controller', {
      observationId: newId(evaluator.crypto),
      revision: 1,
      kind: 'task',
      taskId: 'T-01',
      rating: 'met',
      notes: 'Airlines told at 1:09',
      exerciseTime: '1:09',
      observedAt: Date.now(),
      mselRowId: 'I-01',
    })
    const recordPath = join(projectPath, 'scenarios', scenarioId, 'evaluation.json')
    await vi.waitFor(() => expect(existsSync(recordPath)).toBe(true))
    const record = JSON.parse(readFileSync(recordPath, 'utf8'))
    expect(record.observations).toHaveLength(1)
    expect(record.observations[0]).toMatchObject({
      taskId: 'T-01',
      rating: 'met',
      source: 'live',
      evaluator: 'Evaluator 1',
    })
    expect(seenByPlayer).toEqual([])

    const log = readLog(projectPath, scenarioId, started.session!.id)
    expect(log.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['eval.assign', 'eval.observation']),
    )
    expect(JSON.stringify(log)).not.toContain(evaluator.identity.clientId)

    // A player's observation is dropped and logged, never saved.
    await player.client.send('eval.observation', 'controller', {
      observationId: newId(player.crypto),
      revision: 1,
      kind: 'note',
      notes: 'sneaky',
      exerciseTime: '1:10',
      observedAt: Date.now(),
    })
    await vi.waitFor(() =>
      expect(
        readLog(projectPath, scenarioId, started.session!.id).some((e) => e.kind === 'anomaly'),
      ).toBe(true),
    )
    expect(JSON.parse(readFileSync(recordPath, 'utf8')).observations).toHaveLength(1)
    await endSession(projectPath, scenarioId)
  })
})

describe('surveys on devices through a running session (#422)', () => {
  afterEach(async () => {
    await stopLiveSession()
    delete process.env.TTX_LIVE_BIND
  })

  const NOW = '2026-10-28T14:00:00.000Z'
  const feedback = Survey.parse({
    id: 'FEEDBACK',
    title: 'Participant feedback',
    kind: 'participant_feedback',
    createdAt: NOW,
    updatedAt: NOW,
    sections: [
      {
        id: 's',
        questions: [
          { id: 'r1', type: 'rating', text: 'The scenario was realistic', required: true },
          { id: 't1', type: 'text', text: 'What would you change?' },
        ],
      },
    ],
  })

  it('sends a survey to devices, stores sealed answers without a sender, and closes', async () => {
    const { projectPath, scenarioId } = await setup()
    await writeSurvey(projectPath, scenarioId, feedback)
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    const url = started.invites!.players.url
    const players = [await joinAsPlayer(url, 'A', 'ops'), await joinAsPlayer(url, 'B', 'pio')]
    expect(players[0]!.welcome.features.surveys).toBe(true)
    const opens = players.map(() => [] as Opened<'survey.open'>[])
    const closes = players.map(() => [] as Opened<'survey.close'>[])
    players.forEach((p, i) => {
      p.client.setDestinations(['all', `role:${i ? 'pio' : 'ops'}`])
      p.client.on('survey.open', (m) => opens[i]!.push(m))
      p.client.on('survey.close', (m) => closes[i]!.push(m))
    })

    const view = await openSurvey(projectPath, scenarioId, 'FEEDBACK')
    await vi.waitFor(() => expect(opens.every((o) => o.length === 1)).toBe(true))
    expect(opens[0]![0]!.payload).toMatchObject({
      surveyId: view.deliveryId,
      anonymous: true,
      title: 'Participant feedback',
    })
    expect(opens[0]![0]!.signedBy).toBe('host')

    const answer = (i: number, rating: number) =>
      players[i]!.client.send('survey.response', 'controller', {
        surveyId: view.deliveryId,
        answers: [{ questionId: 'r1', value: rating }],
      })
    await answer(0, 2)
    await answer(0, 4)
    await answer(1, 5)
    await vi.waitFor(() => expect(liveSurveys(projectPath, scenarioId)[0]!.responses).toBe(2))
    const stored = await readResponses(projectPath, scenarioId, 'FEEDBACK')
    expect(stored.map((r) => r.answers['r1']).sort()).toEqual([4, 5])
    expect(stored.every((r) => r.channel === 'live' && r.deliveryId === view.deliveryId)).toBe(true)

    const done = await closeSurvey(projectPath, scenarioId, view.deliveryId)
    expect(done).toMatchObject({ status: 'closed', responses: 2 })
    await vi.waitFor(() => expect(closes.every((c) => c.length === 1)).toBe(true))
    await answer(1, 1)
    await endSession(projectPath, scenarioId)

    const log = readLog(projectPath, scenarioId, started.session!.id)
    expect(
      log
        .filter((e) => e.kind === 'survey.response')
        .every((e) => e.actor.kind === 'client' && !e.actor.clientRef && !e.actor.seat),
    ).toBe(true)
    const text = JSON.stringify(log) + JSON.stringify(stored)
    for (const p of players) expect(text).not.toContain(p.identity.clientId)
  })

  it('a survey-only session offers one participant seat, only surveys, and tags answers as QR', async () => {
    const { projectPath, scenarioId } = await setup()
    await writeSurvey(projectPath, scenarioId, feedback)
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
      surveyOnly: true,
    })
    expect(started.session!.surveyOnly).toBe(true)
    const lobby = await joinAsPlayer(started.invites!.players.url, 'Phone')
    expect(lobby.welcome.seats!.map((s) => s.name)).toEqual(['Participant'])
    expect(lobby.welcome.features).toEqual({
      messages: false,
      votes: false,
      hotwash: false,
      surveys: true,
      eval: false,
    })
    const seated = await joinAsPlayer(
      started.invites!.players.url,
      'Phone 2',
      'observers',
      'observer',
    )
    seated.client.setDestinations(['all', 'role:observers'])
    const opened = new Promise<Opened<'survey.open'>>((resolve) =>
      seated.client.on('survey.open', resolve),
    )
    const view = await openSurvey(projectPath, scenarioId, 'FEEDBACK')
    await opened
    await seated.client.send('survey.response', 'controller', {
      surveyId: view.deliveryId,
      answers: [{ questionId: 'r1', value: 3 }],
    })
    await vi.waitFor(async () =>
      expect((await readResponses(projectPath, scenarioId, 'FEEDBACK'))[0]).toMatchObject({
        channel: 'qr',
      }),
    )
    await endSession(projectPath, scenarioId)
  })
})
