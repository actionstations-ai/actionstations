// SimCell helper devices in a real LAN session (#518): who is shown the seat, who may take it,
// the switch that turns drafts on, and that a decision from a device that is not a helper is
// refused and logged.
import { tmpdir } from 'node:os'
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

const { flushActiveLog, setSimcellHelpers, simcellHelpers } = await import('./session')
const { joinAsPlayer, quiet, readLog, startLan } = await import('./session-harness')

afterEach(quiet)

describe('SimCell helper seat in a live session', () => {
  it('shows the seat only to a device with the staff key, and seats a proven helper', async () => {
    const { started } = await startLan()
    const players = await joinAsPlayer(started.invites!.players.url, 'Dana')
    expect(players.welcome.seats?.map((s) => s.id)).not.toContain('simcell')
    const helper = await joinAsPlayer(started.invites!.staff.url, 'Sam', undefined, 'simcell')
    expect(helper.welcome.seats?.map((s) => s.id)).toContain('simcell')
  })

  it('refuses the seat on a players link and seats a staff device that asks for it', async () => {
    const { started } = await startLan()
    const refused = await joinAsPlayer(started.invites!.players.url, 'Dana', 'simcell', 'simcell')
    expect(refused.welcome.rejected?.reason).toBe('not_allowed')
    const seated = await joinAsPlayer(started.invites!.staff.url, 'Sam', 'simcell', 'simcell')
    expect(seated.welcome.rejected).toBeUndefined()
    expect(seated.welcome.role?.id).toBe('simcell')
  })

  it('counts helper devices once they are on, and refuses a decision from a player', async () => {
    const { projectPath, scenarioId, started, sessionId } = await startLan()
    expect(simcellHelpers(projectPath, scenarioId)).toEqual({ enabled: false, devices: 0 })
    await joinAsPlayer(started.invites!.staff.url, 'Sam', 'simcell', 'simcell')
    expect(await setSimcellHelpers(projectPath, scenarioId, true)).toEqual({
      enabled: true,
      devices: 1,
    })
    const player = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    await player.client.send('simcell.action', 'controller', {
      draftId: 'D'.repeat(22),
      revision: 1,
      action: 'approve',
    })
    await vi.waitFor(async () => {
      await flushActiveLog(projectPath, scenarioId)
      const log = readLog(projectPath, scenarioId, sessionId)
      expect(
        log.some((e) => e.kind === 'anomaly' && e.data['what'] === 'simcell action rejected'),
      ).toBe(true)
    })
  })
})
