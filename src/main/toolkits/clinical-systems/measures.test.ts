// Every clinical measure that reads events works end to end (issue #1131). The events come from
// where they would in an exercise: the downtime and patient generators write the simulated world
// into the scenario's case data; players and the controller record the rest on the toolkits'
// decision forms, checked by the live form schema exactly as a device or Facilitate would send
// them; the session log and the facilitator file carry the decisions. The evaluation's
// `runToolkitMetrics` then computes each measure, and each test checks one result.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

vi.mock('../../packs/layers', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  const pack = {
    id: 'ai.actionstations.health-test',
    version: '1.0.0',
    name: 'Health toolkits',
    dir: '',
    bundled: true,
    enabled: true,
    manifest: {
      contents: {
        templates: [],
        prompts: [],
        domains: [],
        workflows: [],
        documents: [],
        examples: [],
        regulations: [],
        frameworks: [],
        toolkits: ['clinical_systems', 'clinical_care'],
      },
    },
    items: [],
  }
  return {
    ...original,
    enabledPacks: () => [],
    bundledPacks: () => [pack],
    packsRevision: () => 1,
    packItemPath: (_p: unknown, _k: unknown, id: string) => resolve(`packs/toolkits/${id}.json`),
  }
})

const { checkSubmission, buildDecisionRecord, DecisionForm } =
  await import('@shared/schemas/decisions')
const { decisionLogData } = await import('@shared/decisions/records')
const { runToolkitMetrics } = await import('../metrics')
const { liveFormsOf } = await import('../decision-forms')
const { resolveToolkits } = await import('../registry')
const { runGenerator } = await import('../../case-data/generators')
const { createProject } = await import('../../project/store')
const { createScenario, updateScenario } = await import('../../scenario/store')
const { sessionFolder } = await import('../../live/log-read')
const { writeFacilitatorState, emptyFacilitatorState } = await import('../../facilitator/state')
const { ScenarioBrief } = await import('@shared/schemas')
const { registerClinicalToolkit } = await import('../clinical/register')
const { registerClinicalSystemsToolkit } = await import('./register')
const { readClinicalCase } = await import('./play')
await import('./register-generators')

type Form = ReturnType<typeof DecisionForm.parse>
type Value = string | number
type Results = Awaited<ReturnType<typeof runToolkitMetrics>>['results']

const START = '2026-11-12T02:00:00.000Z'
const SESSION = 'sess-clinical'
const hmm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
const wall = (min: number) => new Date(Date.parse('2026-11-12T15:00:00.000Z') + min * 60_000)

registerClinicalToolkit()
registerClinicalSystemsToolkit()

let forms: Form[] = []

/** A decision as the live path records it: checked against its live form, then logged. */
function decision(n: number, formId: string, fields: Record<string, Value>, exMin: number) {
  const form = forms.find((f) => f.id === formId)!
  const checked = checkSubmission(form, { fields })
  if (!checked.ok) throw new Error(`${formId}: ${checked.error}`)
  return buildDecisionRecord({
    id: `dec-${n}`,
    form,
    checked,
    seat: { kind: 'facilitator' },
    source: 'facilitator',
    time: wall(exMin).toISOString(),
    exerciseTime: hmm(exMin),
  })
}

async function scenarioWithCase() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-clinical-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'Harbor General' })
  const s = await createScenario(root, {
    title: 'EHR downtime',
    brief: ScenarioBrief.parse({ userPrompt: 'The EHR and its interfaces fail overnight.' }),
  })
  await updateScenario(
    root,
    s.id,
    (x) => void (x.toolkits = ['clinical_systems', 'clinical_care']),
    {
      by: 'user',
    },
  )
  const deps = { maxMbPerScenario: 50 }
  await runGenerator(
    root,
    s.id,
    'clinical-downtime',
    { start: START, beds: 200, durationHours: 4, units: ['4 West', 'ICU'], criticalResults: 2 },
    deps,
  )
  await runGenerator(
    root,
    s.id,
    'clinical-trajectory',
    { kind: 'sepsis', seed: 7, start: START },
    deps,
  )
  return { root, scenarioId: s.id }
}

/** Write the decisions to the session log (and, optionally, some to the facilitator file). */
async function run(
  ctx: { root: string; scenarioId: string },
  logged: ReturnType<typeof decision>[],
  saved: ReturnType<typeof decision>[] = [],
): Promise<Results> {
  const dir = sessionFolder(ctx.root, ctx.scenarioId, SESSION)
  mkdirSync(dir, { recursive: true })
  const lines = logged.map((r, i) => ({
    i: i + 1,
    at: r.time,
    ex: r.exerciseTime,
    kind: 'decision.submitted',
    actor: { kind: 'controller' },
    data: decisionLogData(r),
  }))
  writeFileSync(join(dir, 'log.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  await writeFacilitatorState(ctx.root, ctx.scenarioId, {
    ...emptyFacilitatorState(),
    decisionRecords: saved,
  })
  const { results, skipped } = await runToolkitMetrics(ctx.root, ctx.scenarioId, {
    sessionId: SESSION,
  })
  // The toolkit also names a HIPAA notification clock measure the app has no code for yet; every
  // other measure runs.
  expect(skipped.map((x) => x.id)).toEqual(['notification_clocks_met'])
  return results
}

const data = (results: Results, id: string) =>
  results.find((r) => r.metricId === id)!.data as Record<string, unknown>

let ctx: { root: string; scenarioId: string }
let caseEvents: Awaited<ReturnType<typeof readClinicalCase>>['events']

beforeAll(async () => {
  forms = liveFormsOf(await resolveToolkits(['clinical_systems', 'clinical_care'])).map((f) =>
    DecisionForm.parse(f),
  )
  ctx = await scenarioWithCase()
  caseEvents = (await readClinicalCase(ctx.root, ctx.scenarioId)).events
})

const minutesOf = (iso: string) => (Date.parse(iso) - Date.parse(START)) / 60_000

describe('clinical systems measures', () => {
  it('declaration to all units on downtime procedures: units from the simulator, reports from players', async () => {
    const results = await run(ctx, [
      decision(
        1,
        'declare_downtime',
        { systems: 'EHR', kind: 'unplanned', told: 'All units', time: '0:15' },
        16,
      ),
      decision(2, 'report_unit_on_downtime', { unit: '4 West', time: '0:40' }, 41),
      decision(3, 'report_unit_on_downtime', { unit: 'ICU', time: '1:30' }, 92),
    ])
    expect(data(results, 'time_to_downtime_procedures')).toMatchObject({
      allUnitsMinutes: 75,
      withinTarget: 1,
    })
  })

  it('orders and results lost, delayed or duplicated: the downtime model and the controller log', async () => {
    const backlog = caseEvents.find((e) => e.kind === 'system_recovered')!.attrs.backlog as Record<
      string,
      number
    >
    const results = await run(ctx, [
      decision(
        1,
        'message_disposition',
        { feed: 'Orders', message_class: 'ORM', action: 'discard', time: '4:05' },
        245,
      ),
      decision(
        2,
        'log_systems_event',
        { event: 'order_or_result_duplicated', message_class: 'Radiology', count: 3, time: '4:30' },
        270,
      ),
    ])
    expect(data(results, 'safe_care_losses')).toMatchObject({
      lost: backlog.orders,
      delayed: backlog.lab_results! + backlog.adt! + backlog.pharmacy!,
      duplicated: 3,
    })
  })

  it('critical results communicated within target: results from the simulator, calls from players', async () => {
    const [first, second] = caseEvents.filter((e) => e.kind === 'critical_result')
    const given = String(first!.attrs.patient).split(',')[1]!.split('(')[0]!.trim()
    const at = minutesOf(first!.time) + 20
    const results = await run(ctx, [
      decision(
        1,
        'communicate_critical_result',
        { patient: given, to: 'Dr. Okafor', read_back: 'yes', time: hmm(at) },
        at + 1,
      ),
    ])
    expect(second).toBeDefined()
    expect(data(results, 'critical_result_communication')).toEqual({
      within: 1,
      total: 2,
      pending: 1,
    })
  })

  it('reconciliation time and percent complete: paper from the simulator, progress from players', async () => {
    const results = await run(ctx, [
      decision(1, 'reconcile_unit', { unit: '4 West', done: 30, remaining: 10, time: '5:00' }, 300),
      decision(2, 'close_reconciliation', { time: '6:00' }, 360),
    ])
    const d = data(results, 'reconciliation_progress')
    // ICU has not reported: its simulated paper count still counts as remaining.
    expect(d.done).toBe(30)
    expect(d.remaining).toBeGreaterThan(10)
    expect(d.minutes).toBe(120)
  })

  it('duplicate records created: surfaced in back-entry and logged by the controller, against the model', async () => {
    const results = await run(ctx, [
      decision(
        1,
        'reconcile_unit',
        { unit: '4 West', done: 1000, remaining: 0, time: '5:00' },
        300,
      ),
      decision(
        2,
        'log_systems_event',
        { event: 'duplicate_record_created', patient: 'TESTPATIENT, Birch', time: '5:10' },
        310,
      ),
    ])
    expect(data(results, 'duplicate_records_created')).toEqual({ created: 2, expected: 1 })
  })

  it('reads decisions recorded in Facilitate without devices from the facilitator file', async () => {
    const declare = decision(
      1,
      'declare_downtime',
      { systems: 'EHR', kind: 'unplanned', told: 'All', time: '0:10' },
      10,
    )
    const units = [
      decision(2, 'report_unit_on_downtime', { unit: '4 West', time: '0:20' }, 20),
      decision(3, 'report_unit_on_downtime', { unit: 'ICU', time: '0:30' }, 30),
    ]
    const results = await run(ctx, [declare], [declare, ...units])
    expect(data(results, 'time_to_downtime_procedures')).toMatchObject({
      allUnitsMinutes: 20,
      withinTarget: 2,
    })
  })
})

describe('clinical care (nursing) measures', () => {
  it('time to escalation: the score and critical lab from the simulated patient, the call from the nurse', async () => {
    const ews = caseEvents.find((e) => e.kind === 'abnormal_early_warning_score')!
    const lab = caseEvents.find((e) => e.kind === 'critical_lab')!
    const callAt = minutesOf(ews.time) + 10
    const notifyAt = minutesOf(lab.time) + 30
    const results = await run(ctx, [
      decision(
        1,
        'call_rapid_response',
        { patient: String(ews.attrs.patient), trigger: 'early_warning_score', time: hmm(callAt) },
        callAt,
      ),
      decision(
        2,
        'notify',
        { who: 'Covering physician', what: 'Lactate critical', time: hmm(notifyAt) },
        notifyAt,
      ),
    ])
    expect(data(results, 'time_to_escalation')).toEqual({
      escalated: 1,
      meanMinutesToCall: 10,
      meanMinutesToProvider: 30,
    })
  })

  it('triage accuracy: the victim from the controller log, the tag from the players', async () => {
    const results = await run(ctx, [
      decision(
        1,
        'log_clinical_event',
        { event: 'triage_victim_arrives', patient: 'Tag 12', expected: 'Immediate', time: '0:05' },
        5,
      ),
      decision(2, 'triage_arrival', { patient: 'Tag 12', category: 'immediate_red' }, 9),
    ])
    expect(data(results, 'triage_accuracy')).toMatchObject({ victims: 1, correct: 1 })
  })

  it('evacuation order: the priority key from the controller log, the order from the players', async () => {
    const results = await run(ctx, [
      decision(
        1,
        'log_clinical_event',
        { event: 'evacuation_priority_key', expected: 'Bed 1, Bed 2, Bed 3', time: '0:05' },
        5,
      ),
      decision(
        2,
        'set_evacuation_order',
        { ranking: 'Bed 2, Bed 1, Bed 3', reasons: 'Ventilated first' },
        20,
      ),
    ])
    expect(data(results, 'evacuation_order')).toMatchObject({ keyCount: 3, topMatched: 3 })
  })

  it('infection control decisions: the case from the controller log, the isolation from the players', async () => {
    const results = await run(ctx, [
      decision(
        1,
        'log_clinical_event',
        {
          event: 'infection_case_found',
          patient: '412',
          detail: 'C. difficile',
          expected: 'Single room isolation',
          precautions: 'Contact plus',
          time: '0:30',
        },
        30,
      ),
      decision(
        2,
        'isolate_or_cohort',
        { patients: 'Room 412', action: 'single_room_isolation', precautions: 'contact_plus' },
        45,
      ),
    ])
    expect(data(results, 'infection_control_decisions')).toMatchObject({ cases: 1, asScripted: 1 })
  })

  it('disclosure timing: the harm event from the controller log, the conversation from the players', async () => {
    const results = await run(ctx, [
      decision(
        1,
        'log_clinical_event',
        { event: 'harm_event', detail: 'Insulin given twice', time: '1:00' },
        60,
      ),
      decision(
        2,
        'disclose_event',
        { who_discloses: 'Attending', to_whom: 'Daughter', time: '1:40' },
        101,
      ),
    ])
    expect(data(results, 'disclosure_timing')).toMatchObject({
      events: 1,
      onTime: 1,
      meanMinutes: 40,
    })
  })

  it('outage to downtime declaration: the outage from the downtime simulator', async () => {
    const results = await run(ctx, [
      decision(
        1,
        'declare_downtime',
        { systems: 'EHR', kind: 'unplanned', told: 'House supervisor', time: '0:15' },
        16,
      ),
    ])
    expect(data(results, 'downtime_workflow_time')).toMatchObject({ periods: 1, meanMinutes: 15 })
  })
})
