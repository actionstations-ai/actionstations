// Shared set-up for tests that drive a real LAN session: a project with two roles, a started
// session, and phones that join through the invite link. Import it after `vi.mock('electron')`.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LiveClient } from '@shared/live/client'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { createIdentity } from '@shared/live/identity'
import { parseInvite } from '@shared/live/invite'
import type { WelcomePayload } from '@shared/live/schemas'
import { ScenarioBrief } from '@shared/schemas'
import type { SessionLogEntry } from '@shared/schemas/live'
import { createProject } from '../project/store'
import { createScenario, getScenario, saveScenario } from '../scenario/store'
import { resetSettingsCache } from '../settings/store'
import { startSession, stopLiveSession } from './session'
import { wsTransport } from './transport/lan/test-clients'

export async function setupProject() {
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

export function readLog(
  projectPath: string,
  scenarioId: string,
  sessionId: string,
): SessionLogEntry[] {
  const path = join(projectPath, 'scenarios', scenarioId, 'live', sessionId, 'log.jsonl')
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as SessionLogEntry)
}

/** A phone: keys from the invite link, its own identity, a WebSocket to the LAN server. */
export async function joinAsPlayer(
  inviteUrl: string,
  name: string,
  requestedRole?: string,
  kind: 'player' | 'evaluator' | 'observer' | 'simcell' = 'player',
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

export const quiet = async () => {
  await stopLiveSession()
  delete process.env.TTX_LIVE_BIND
}

export async function startLan() {
  const ctx = await setupProject()
  const started = await startSession({
    projectPath: ctx.projectPath,
    scenarioId: ctx.scenarioId,
    connection: { kind: 'lan', tls: 'none' },
    attribution: 'role',
  })
  return { ...ctx, started, sessionId: started.session!.id }
}
