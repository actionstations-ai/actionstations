// Releasing an inject to one chosen device (#412, #494): the UI names a device by the reference
// the log uses; main turns it into the wire destination, and neither the summary nor the log
// shows a client id.
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Opened } from '@shared/live/codec'

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

const { endSession, liveDevices, releaseInject, releaseSummaries, resendInject } =
  await import('./session')
const { getScenario, saveScenario } = await import('../scenario/store')
const { joinAsPlayer, quiet, readLog, startLan } = await import('./session-harness')

async function addRow(projectPath: string, scenarioId: string) {
  const scenario = await getScenario(projectPath, scenarioId)
  const row = {
    id: 'I-01',
    phaseId: 'p1',
    time: '0:10',
    from: 'Gate agent',
    toRoleIds: [],
    event: 'A board goes dark',
    expectedAction: '',
    purposeTag: 'NOISE',
  }
  await saveScenario(projectPath, { ...scenario, msel: [row as never] }, { by: 'user' })
}

describe('per-device inject targets', () => {
  afterEach(quiet)

  it('sends to the one device picked and to no other player', async () => {
    const { projectPath, scenarioId, started, sessionId } = await startLan()
    await addRow(projectPath, scenarioId)
    const dana = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const sam = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const toDana: Opened<'inject.release'>[] = []
    const toSam: Opened<'inject.release'>[] = []
    dana.client.on('inject.release', (m) => m.to.startsWith('client:') && toDana.push(m))
    sam.client.on('inject.release', (m) => m.to.startsWith('client:') && toSam.push(m))
    const devices = await liveDevices(projectPath, scenarioId)
    const target = devices.find((d) => d.label === 'Operations Director')!

    const summary = await releaseInject(projectPath, scenarioId, {
      rowId: 'I-01',
      targets: [`client:${target.clientRef}`],
    })

    await vi.waitFor(() => expect(toDana).toHaveLength(1))
    expect(toSam).toEqual([])
    expect(summary.targets).toEqual([`client:${target.clientRef}`])
    expect(summary.counts.to).toBe(1)
    const logged = readLog(projectPath, scenarioId, sessionId).find(
      (e) => e.kind === 'inject.release',
    )
    expect(JSON.stringify(logged)).not.toContain(dana.identity.clientId)
    await endSession(projectPath, scenarioId)
  })

  it('resends to a second device by its reference', async () => {
    const { projectPath, scenarioId, started } = await startLan()
    await addRow(projectPath, scenarioId)
    await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const sam = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const toSam: Opened<'inject.release'>[] = []
    sam.client.on('inject.release', (m) => m.to.startsWith('client:') && toSam.push(m))
    const devices = await liveDevices(projectPath, scenarioId)
    const ops = devices.find((d) => d.label === 'Operations Director')!
    const pio = devices.find((d) => d.label === 'PIO')!
    const first = await releaseInject(projectPath, scenarioId, {
      rowId: 'I-01',
      targets: [`client:${ops.clientRef}`],
    })
    await resendInject(projectPath, scenarioId, first.releaseId, [`client:${pio.clientRef}`])
    await vi.waitFor(() => expect(toSam).toHaveLength(1))
    const [summary] = await releaseSummaries(projectPath, scenarioId)
    expect(summary!.targets).toEqual([`client:${ops.clientRef}`, `client:${pio.clientRef}`])
    await endSession(projectPath, scenarioId)
  })

  it('refuses a device that has left', async () => {
    const { projectPath, scenarioId } = await startLan()
    await addRow(projectPath, scenarioId)
    await expect(
      releaseInject(projectPath, scenarioId, { rowId: 'I-01', targets: ['client:deadbeef'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
