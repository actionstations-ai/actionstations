// Structured decisions in a live session (spec 0448 FR-14): the form reaches the seats it names,
// a submission is checked against it, logged once, and attributed by the session's rule.
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Opened } from '@shared/live/codec'
import { decisionRecordsFromLog } from '@shared/decisions/records'
import { WARNING_FORM } from '@shared/decisions/fixtures'
import type { DecisionForm } from '@shared/schemas/decisions'

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

const { endSession, listDecisions, recordDecision, startSession, decisionForms } =
  await import('./session')
const { provideDecisionForms } = await import('./decision-forms')
const { joinAsPlayer, quiet, readLog, setupProject } = await import('./session-harness')

const FORM: DecisionForm = { ...WARNING_FORM, seats: ['pio'] }
const OPEN_FORM: DecisionForm = { ...WARNING_FORM, id: 'open-form', seats: undefined }
const ID_1 = 'AAAAAAAAAAAAAAAAAAAAAA'
const ID_2 = 'BBBBBBBBBBBBBBBBBBBBBB'

const submission = (decisionId = ID_1, over: Record<string, unknown> = {}) => ({
  decisionId,
  formId: 'issue-warning',
  fields: [{ fieldId: 'level', value: 'warning' }],
  area: { areaId: 'harbor' },
  ...over,
})

async function start(attribution: 'role' | 'named') {
  const ctx = await setupProject()
  const started = await startSession({
    projectPath: ctx.projectPath,
    scenarioId: ctx.scenarioId,
    connection: { kind: 'lan', tls: 'none' },
    attribution,
  })
  return { ...ctx, started, sessionId: started.session!.id }
}

describe('decisions in a live session', () => {
  afterEach(async () => {
    provideDecisionForms(undefined)
    await quiet()
  })

  it('sends a device the forms its seat may use, signed, and no others', async () => {
    provideDecisionForms(() => [FORM, OPEN_FORM])
    const { started } = await start('role')
    const forms = (name: string, role: string) =>
      joinAsPlayer(started.invites!.players.url, name, role).then((p) => {
        const seen: Opened<'decision.form'>[] = []
        p.client.on('decision.form', (m) => seen.push(m))
        return seen
      })
    const pio = await forms('Sam', 'pio')
    const ops = await forms('Dana', 'ops')
    await vi.waitFor(() => expect(pio).toHaveLength(2))
    await vi.waitFor(() => expect(ops).toHaveLength(1))
    expect(pio.map((m) => m.payload.form.id).sort()).toEqual(['issue-warning', 'open-form'])
    expect(ops.map((m) => m.payload.form.id)).toEqual(['open-form'])
    expect(pio.every((m) => m.signedBy === 'host' && m.to.startsWith('client:'))).toBe(true)
  })

  it('logs a submitted decision once, with the role and the time, and no name at role level', async () => {
    provideDecisionForms(() => [FORM])
    const { projectPath, scenarioId, started, sessionId } = await start('role')
    const pio = await joinAsPlayer(started.invites!.players.url, 'Sam Shepard', 'pio')
    await pio.client.send('decision.submit', 'controller', submission())
    await vi.waitFor(() => expect(listDecisions(projectPath, scenarioId)).toHaveLength(1))
    // The same decision sent again after a dropped connection counts once.
    await pio.client.send('decision.submit', 'controller', submission())
    await pio.client.send('decision.submit', 'controller', submission(ID_2, { fields: [] }))
    await vi.waitFor(() =>
      expect(readLog(projectPath, scenarioId, sessionId).some((e) => e.kind === 'anomaly')).toBe(
        true,
      ),
    )
    await endSession(projectPath, scenarioId)

    const log = readLog(projectPath, scenarioId, sessionId)
    const records = decisionRecordsFromLog(log)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: ID_1,
      kind: 'warning',
      source: 'device',
      area: { id: 'harbor', name: 'Harbor' },
      fields: { level: 'warning' },
      seat: { kind: 'player', roleId: 'pio', label: 'PIO' },
    })
    expect(records[0]!.time).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(records[0]!.exerciseTime).toMatch(/^\d+:\d\d$/)
    expect(records[0]!.seat.name).toBeUndefined()
    expect(JSON.stringify(log)).not.toContain('Sam Shepard')
    expect(
      log.some((e) => e.kind === 'anomaly' && /Level is required/.test(String(e.data.what))),
    ).toBe(true)
  })

  it('keeps the name in a named session, in the actor only', async () => {
    provideDecisionForms(() => [FORM])
    const { projectPath, scenarioId, started, sessionId } = await start('named')
    const pio = await joinAsPlayer(started.invites!.players.url, 'Sam Shepard', 'pio')
    await pio.client.send('decision.submit', 'controller', submission())
    await vi.waitFor(() => expect(listDecisions(projectPath, scenarioId)).toHaveLength(1))
    await endSession(projectPath, scenarioId)
    const line = readLog(projectPath, scenarioId, sessionId).find(
      (e) => e.kind === 'decision.submitted',
    )!
    expect(line.actor.displayName).toBe('Sam Shepard')
    expect(JSON.stringify(line.data)).not.toContain('Sam Shepard')
    expect(decisionRecordsFromLog([line])[0]!.seat.name).toBe('Sam Shepard')
  })

  it('refuses a decision from a seat the form is not for, or for a form that was not sent', async () => {
    provideDecisionForms(() => [FORM])
    const { projectPath, scenarioId, started, sessionId } = await start('role')
    const ops = await joinAsPlayer(started.invites!.players.url, 'Dana', 'ops')
    await ops.client.send('decision.submit', 'controller', submission())
    await ops.client.send('decision.submit', 'controller', submission(ID_2, { formId: 'nope' }))
    await vi.waitFor(() =>
      expect(
        readLog(projectPath, scenarioId, sessionId).filter((e) => e.kind === 'anomaly'),
      ).toHaveLength(2),
    )
    expect(listDecisions(projectPath, scenarioId)).toEqual([])
  })

  it('lets the facilitator record a decision into the log, with a role', async () => {
    provideDecisionForms(() => [FORM])
    const { projectPath, scenarioId, sessionId } = await start('role')
    const record = await recordDecision(projectPath, scenarioId, {
      formId: 'issue-warning',
      fields: { level: 'watch' },
      area: { areaId: 'north' },
      roleId: 'ops',
    })
    expect(record).toMatchObject({
      source: 'facilitator',
      seat: { kind: 'facilitator', roleId: 'ops', label: 'Operations Director' },
    })
    await expect(
      recordDecision(projectPath, scenarioId, { formId: 'issue-warning', fields: {} }),
    ).rejects.toThrow(/Level is required/)
    await endSession(projectPath, scenarioId)
    const found = decisionRecordsFromLog(readLog(projectPath, scenarioId, sessionId))
    expect(found.map((r) => r.id)).toEqual([record.id])
    expect(found[0]!.seat).toMatchObject({ kind: 'facilitator', roleId: 'ops' })
  })

  it('builds a facilitator decision with no session running', async () => {
    provideDecisionForms(() => [FORM])
    const ctx = await setupProject()
    const forms = await decisionForms(ctx.projectPath, ctx.scenarioId)
    expect(forms.map((f) => f.id)).toEqual(['issue-warning'])
    const record = await recordDecision(ctx.projectPath, ctx.scenarioId, {
      formId: 'issue-warning',
      fields: { level: 'warning' },
      area: { areaId: 'harbor' },
    })
    expect(record).toMatchObject({
      source: 'facilitator',
      kind: 'warning',
      seat: { kind: 'facilitator' },
    })
    expect(listDecisions(ctx.projectPath, ctx.scenarioId)).toEqual([])
  })

  it('has no forms until a provider is set, and skips an invalid or repeated form', async () => {
    const ctx = await setupProject()
    expect(await decisionForms(ctx.projectPath, ctx.scenarioId)).toEqual([])
    provideDecisionForms(() => [{ id: 'bad' }, FORM, { ...FORM, title: 'Again' }])
    const forms = await decisionForms(ctx.projectPath, ctx.scenarioId)
    expect(forms).toHaveLength(1)
    expect(forms[0]!.title).toBe('Issue a warning')
  })
})
