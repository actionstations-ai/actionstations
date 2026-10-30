// The co-controller roster of a regional exercise goes to devices when the host's session starts
// and to each device that joins later (#440 FR-19). Nothing is sent for a scenario that is not a
// regional exercise.
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { toBase64Url } from '@shared/live/bytes'

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

const regional = vi.hoisted(() => ({ on: false, key: '' }))
vi.mock('../regional/store', () => ({ hasRegional: async () => regional.on }))
vi.mock('../regional/manage', () => ({
  rosterFor: async (_root: string, _scenario: string, revision: number) => ({
    roster: {
      revision,
      controllers: [
        {
          id: 'AIR',
          name: 'Airport',
          publicKey: regional.key,
          scope: { rowPrefixes: ['AIR'], roleIds: ['ops'] },
        },
      ],
    },
    missingLiveKey: ['CITY'],
  }),
}))

const { endSession, regionalRoster, sendRegionalRoster, startSession } = await import('./session')
const { joinAsPlayer, quiet, setupProject, startLan } = await import('./session-harness')

afterEach(async () => {
  regional.on = false
  await quiet()
})

async function enable() {
  const keys = await createWebCryptoProvider().ecdsaGenerate()
  regional.key = toBase64Url(keys.publicKey)
  regional.on = true
}

describe('co-controller roster on the live connection', () => {
  it('sends the roster to devices that join, and reports who is missing a key', async () => {
    await enable()
    const { projectPath, scenarioId, started } = await startLan()
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    await vi.waitFor(() => expect(player.client.roster?.controllers).toHaveLength(1))
    expect(player.client.roster).toMatchObject({
      revision: 1,
      controllers: [{ id: 'AIR', name: 'Airport', scope: { rowPrefixes: ['AIR'] } }],
    })
    expect(await regionalRoster(projectPath, scenarioId)).toEqual({
      sent: true,
      revision: 1,
      controllers: [
        {
          id: 'AIR',
          name: 'Airport',
          rowPrefixes: ['AIR'],
          roleCount: 1,
          // No explicit grant in the roster: the least a co-controller can do.
          permissions: ['inject'],
        },
      ],
      missingLiveKey: ['CITY'],
    })
    await endSession(projectPath, scenarioId)
  })

  it('sends a newer revision on request and devices take it', async () => {
    await enable()
    const { projectPath, scenarioId, started } = await startLan()
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    await vi.waitFor(() => expect(player.client.roster?.revision).toBe(1))
    const view = await sendRegionalRoster(projectPath, scenarioId)
    expect(view.revision).toBe(2)
    await vi.waitFor(() => expect(player.client.roster?.revision).toBe(2))
    await endSession(projectPath, scenarioId)
  })

  it('sends nothing for a scenario that is not a regional exercise', async () => {
    const ctx = await setupProject()
    const started = await startSession({
      ...ctx,
      connection: { kind: 'lan', tls: 'none' },
      attribution: 'role',
    })
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    expect(player.client.roster).toBeUndefined()
    expect(await regionalRoster(ctx.projectPath, ctx.scenarioId)).toEqual({
      sent: false,
      controllers: [],
      missingLiveKey: [],
    })
    await endSession(ctx.projectPath, ctx.scenarioId)
  })
})
