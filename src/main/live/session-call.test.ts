// A phone row rung as a call on the devices it is for (#429, #494): the call reaches the named
// role only, carries the caller and the words, and is in the log.
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

const { endSession, ringInjectAsCall } = await import('./session')
const { getScenario, saveScenario } = await import('../scenario/store')
const { joinAsPlayer, quiet, readLog, startLan } = await import('./session-harness')

async function addPhoneRow(projectPath: string, scenarioId: string) {
  const scenario = await getScenario(projectPath, scenarioId)
  const row = {
    id: 'I-07',
    phaseId: 'p1',
    time: '0:20',
    from: 'Dana Reyes, Channel 5',
    toRoleIds: ['pio'],
    event: 'Is the terminal closed?',
    expectedAction: '',
    purposeTag: 'NOISE',
  }
  await saveScenario(projectPath, { ...scenario, msel: [row as never] }, { by: 'user' })
}

describe('ringing an inject as a call', () => {
  afterEach(quiet)

  it('rings the named role with the caller and the words, and logs the call', async () => {
    const { projectPath, scenarioId, started, sessionId } = await startLan()
    await addPhoneRow(projectPath, scenarioId)
    const pio = await joinAsPlayer(started.invites!.players.url, 'Sam', 'pio')
    const ops = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    const rang: Opened<'call.ring'>[] = []
    const opsRang: Opened<'call.ring'>[] = []
    pio.client.on('call.ring', (m) => rang.push(m))
    ops.client.on('call.ring', (m) => opsRang.push(m))

    const { callId } = await ringInjectAsCall(projectPath, scenarioId, 'I-07')

    await vi.waitFor(() => expect(rang).toHaveLength(1))
    expect(rang[0]!.payload).toMatchObject({
      callId,
      turn: 1,
      persona: { name: 'Dana Reyes, Channel 5' },
      transcript: 'Is the terminal closed?',
      mselRowId: 'I-07',
    })
    // Addressed to the role only; a device of another seat is not a target.
    expect(rang[0]!.to).toBe('role:pio')
    expect(opsRang.filter((m) => m.to !== 'role:pio')).toEqual([])
    expect(readLog(projectPath, scenarioId, sessionId).some((e) => e.kind === 'call.ring')).toBe(
      true,
    )
    await endSession(projectPath, scenarioId)
  })

  it('refuses a row that is not in the scenario', async () => {
    const { projectPath, scenarioId } = await startLan()
    await expect(ringInjectAsCall(projectPath, scenarioId, 'NOPE')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
