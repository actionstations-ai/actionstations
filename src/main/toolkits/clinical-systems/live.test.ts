// The downtime model in a running session (issue #1130). A real LAN session on a scenario with
// simulated downtime case data: units report back-entry progress on the toolkit's form, and each
// seeded discrepancy arrives on the players' message channels on its own, once, when back-entry
// reaches its threshold. Restore-order decisions change the case Facilitate shows, and the
// facilitator's override stops a rule's effect.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DecisionForm } from '@shared/schemas/decisions'
import { ToolkitSchema } from '@shared/toolkits'
import { DISCREPANCY_PERSONA } from '@shared/clinical/downtime-play'

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

const { endSession, listDecisions, recordDecision } = await import('../../live/session')
const { provideDecisionForms } = await import('../../live/decision-forms')
const { quiet, readLog, startLan } = await import('../../live/session-harness')
const { liveFormsOf } = await import('../decision-forms')
const { runGenerator } = await import('../../case-data/generators')
const { registerClinicalSystemsToolkit } = await import('./register')
const { downtimeStatus, downtimeView } = await import('./play')
await import('./register-generators')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/clinical_systems.json'), 'utf8')),
)
const FORMS = liveFormsOf([toolkit]).map((f) => DecisionForm.parse(f))

registerClinicalSystemsToolkit()
registerClinicalSystemsToolkit()

async function session() {
  provideDecisionForms(() => FORMS)
  const ctx = await startLan()
  await runGenerator(
    ctx.projectPath,
    ctx.scenarioId,
    'clinical-downtime',
    { start: '2026-11-12T02:00:00.000Z', units: ['4 West', 'ICU'], durationHours: 4 },
    { maxMbPerScenario: 50 },
  )
  return ctx
}

const report = (unit: string, done: number, remaining: number, time: string) => ({
  formId: 'reconcile_unit',
  fields: { unit, done, remaining, time },
})

describe('the downtime model in live play', () => {
  afterEach(async () => {
    provideDecisionForms(undefined)
    await quiet()
  })

  it('sends each discrepancy to every team when back-entry reaches it, and only once', async () => {
    const { projectPath, scenarioId, sessionId } = await session()
    const sent = () =>
      readLog(projectPath, scenarioId, sessionId).filter(
        (e) => e.kind === 'message' && e.actor.persona === DISCREPANCY_PERSONA,
      )
    // Nothing is due before anyone reports.
    await recordDecision(projectPath, scenarioId, {
      formId: 'declare_downtime',
      fields: { systems: 'EHR', kind: 'unplanned', told: 'All units', time: '0:10' },
    })
    expect(sent()).toEqual([])
    // 4 West finishes: half of all back-entry, past the first two thresholds (10 and 45%).
    await recordDecision(projectPath, scenarioId, report('4 West', 900, 0, '5:00'))
    await vi.waitFor(() => expect(sent()).toHaveLength(4))
    const texts = sent().map((e) => String(e.data.text))
    expect(texts.filter((t) => /two records/.test(t))).toHaveLength(2)
    expect(texts.filter((t) => /belongs to/.test(t))).toHaveLength(2)
    expect(new Set(sent().map((e) => e.ref?.channel))).toEqual(
      new Set(['team:operations', 'team:communications']),
    )
    // A later report at the same progress sends nothing new.
    await recordDecision(projectPath, scenarioId, report('4 West', 900, 0, '5:10'))
    expect(sent()).toHaveLength(4)
    // Closing reconciliation stops the rest.
    await recordDecision(projectPath, scenarioId, {
      formId: 'close_reconciliation',
      fields: { time: '5:20' },
    })
    await recordDecision(projectPath, scenarioId, report('ICU', 900, 0, '5:30'))
    expect(sent()).toHaveLength(4)
    await endSession(projectPath, scenarioId)
  })

  it('shows Facilitate the rule a restore order fires, and leaves the case alone once overridden', async () => {
    const { projectPath, scenarioId } = await session()
    await recordDecision(projectPath, scenarioId, {
      formId: 'set_restore_order',
      fields: {
        ranking: 'EHR, lab interface, identity check',
        reason: 'Get charting back',
        time: '4:00',
      },
    })
    const fired = downtimeView(
      (await downtimeStatus(projectPath, scenarioId, listDecisions(projectPath, scenarioId)))!,
    )
    expect(fired.fired.map((r) => [r.ruleId, r.overridden])).toEqual([
      ['ehr_before_lab_interface', false],
      ['lab_interface_before_identity_check', false],
    ])
    const backlog = fired.figures.find((f) => /Results waiting/.test(f.label))!
    expect(backlog.now).toBe(Math.round(backlog.before * 1.5))

    await recordDecision(projectPath, scenarioId, {
      formId: 'override_consequence',
      fields: {
        rule: 'ehr_opened_to_clinicians_before_the_lab_',
        action: 'override_the_rule',
        time: '4:05',
      },
    })
    const after = downtimeView(
      (await downtimeStatus(projectPath, scenarioId, listDecisions(projectPath, scenarioId)))!,
    )
    expect(after.fired[0]).toMatchObject({ ruleId: 'ehr_before_lab_interface', overridden: true })
    expect(after.figures.find((f) => /Results waiting/.test(f.label))!.now).toBe(backlog.before)
    await endSession(projectPath, scenarioId)
  })
})
