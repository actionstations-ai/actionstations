// Starting a live session on the relay and on a self-hosted server (#410): consent first, the
// test runs again, the session is created on the (local stand-in) server, the controller's socket
// opens, the invite points at the server, the scenario remembers the connection, Stop ends the
// server session; a refused key creates nothing.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getVersion: () => '0.6.0-test',
  },
  BrowserWindow: { getAllWindows: () => [] },
  powerSaveBlocker: { start: () => 1, stop: () => undefined, isStarted: () => false },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}))

const { startSession, endSession, status, stopLiveSession } = await import('./session')
const { startTestServer } = await import('./transport/test-remote-server')
const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { resetSettingsCache } = await import('../settings/store')
const { readFacilitatorState, writeFacilitatorState } = await import('../facilitator/state')
const { ScenarioBrief } = await import('@shared/schemas')
const { setServerKey } = await import('./transport/self-hosted-client')
const { resetSecretsQueue } = await import('../secrets')

type TestServer = Awaited<ReturnType<typeof startTestServer>>
let server: TestServer | undefined

async function setup(consent: Array<'relay' | 'self-hosted'> = []) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-rs-ud-'))
  process.env.TTX_PLAYER_BUNDLE = join(tmpdir(), 'no-player-bundle-here')
  resetSettingsCache()
  resetSecretsQueue()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-rs-proj-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'Rivergate' })
  const s = await createScenario(projectPath, {
    title: 'FIDS failure',
    brief: ScenarioBrief.parse({}),
  })
  if (consent.length) {
    const state = await readFacilitatorState(projectPath, s.id)
    await writeFacilitatorState(projectPath, s.id, { ...state, live: { consented: consent } })
  }
  return { projectPath, scenarioId: s.id }
}

afterEach(async () => {
  await stopLiveSession()
  delete process.env.TTX_LIVE_RELAY_URL
  await server?.close()
  server = undefined
})

describe('relay session', () => {
  it('will not start before the facilitator confirmed what the relay receives', async () => {
    server = await startTestServer({ kind: 'relay' })
    process.env.TTX_LIVE_RELAY_URL = server.base
    const { projectPath, scenarioId } = await setup()
    await expect(
      startSession({ projectPath, scenarioId, connection: { kind: 'relay' }, attribution: 'role' }),
    ).rejects.toThrow(/Confirm what this connection sends/)
    expect(server.requests).toEqual([])
  })

  it('creates the session on the server, serves the invite from it and ends it on Stop', async () => {
    server = await startTestServer({ kind: 'relay' })
    process.env.TTX_LIVE_RELAY_URL = server.base
    const { projectPath, scenarioId } = await setup(['relay'])
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'relay' },
      attribution: 'role',
    })
    expect(started.remote).toMatchObject({ kind: 'relay', security: 'http' })
    expect(started.invites?.players.url.startsWith(server.base)).toBe(true)
    expect(started.lan).toBeUndefined()
    expect(status(projectPath, scenarioId).connected).toBe(0)
    const state = await readFacilitatorState(projectPath, scenarioId)
    expect(state.live?.connection).toEqual({ kind: 'relay' })

    const sessionId = started.session!.id
    await endSession(projectPath, scenarioId)
    expect(server.requests).toContain(`POST /v1/sessions/${sessionId}/end`)
    expect(server.requests).toContain(`POST /v1/sessions/${sessionId}/join-token`)
  })

  it('creates nothing when the relay is at its daily limit', async () => {
    server = await startTestServer({ kind: 'relay', dailyLimit: true })
    process.env.TTX_LIVE_RELAY_URL = server.base
    const { projectPath, scenarioId } = await setup(['relay'])
    await expect(
      startSession({ projectPath, scenarioId, connection: { kind: 'relay' }, attribution: 'role' }),
    ).rejects.toThrow(/daily limit/)
    expect(server.hubs.size).toBe(0)
    expect(status(projectPath, scenarioId).session).toBeUndefined()
  })
})

describe('self-hosted session', () => {
  it('uses the stored server key and shows the address in the status', async () => {
    server = await startTestServer({ kind: 'self-hosted', serverKey: 'sk-live' })
    const { projectPath, scenarioId } = await setup(['self-hosted'])
    await setServerKey(server.base, 'sk-live')
    const started = await startSession({
      projectPath,
      scenarioId,
      connection: { kind: 'self-hosted', url: server.base, insecureHttp: true },
      attribution: 'role',
    })
    expect(started.remote?.kind).toBe('self-hosted')
    expect(started.remote?.host).toBe(new URL(server.base).host)
    const log = readFileSync(
      join(projectPath, 'scenarios', scenarioId, 'live', started.session!.id, 'log.jsonl'),
      'utf8',
    )
    expect(log).not.toContain('sk-live')
  })

  it('stops at an unconfirmed certificate and creates nothing', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true })
    const { projectPath, scenarioId } = await setup(['self-hosted'])
    await expect(
      startSession({
        projectPath,
        scenarioId,
        connection: { kind: 'self-hosted', url: server.base, insecureHttp: false },
        attribution: 'role',
      }),
    ).rejects.toThrow(/confirm its fingerprint/)
    expect(server.hubs.size).toBe(0)
  })

  it('creates nothing when the server refuses the key', async () => {
    server = await startTestServer({ kind: 'self-hosted', serverKey: 'right', probe: true })
    const { projectPath, scenarioId } = await setup(['self-hosted'])
    await setServerKey(server.base, 'wrong')
    await expect(
      startSession({
        projectPath,
        scenarioId,
        connection: { kind: 'self-hosted', url: server.base, insecureHttp: true },
        attribution: 'role',
      }),
    ).rejects.toThrow(/key does not match this server/)
    expect(server.hubs.size).toBe(0)
  })
})
