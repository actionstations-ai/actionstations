// Integration: the spill_plume toolkit reaches live play and Evaluation (spec 0455 FR-8, FR-9,
// #779). A simulated spill is generated into a scenario; the toolkit's decisions come out as live
// forms whose area lists are the shorelines the oil reaches; decisions in the session log are
// scored by the toolkit's metrics, and nothing the toolkit names is unknown to the app.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const toolkitPath = resolve('packs/toolkits/spill_plume.json')

vi.mock('../packs/layers', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  const pack = {
    id: 'ai.actionstations.toolkit-spill-plume',
    version: '1.0.0',
    name: 'Toolkit: spill and plume',
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
        toolkits: ['spill_plume'],
      },
    },
    items: [],
  }
  return {
    ...original,
    enabledPacks: () => [],
    bundledPacks: () => [pack],
    packsRevision: () => 1,
    packItemPath: () => toolkitPath,
  }
})

const { decisionFormsFor, provideDecisionForms } = await import('../live/decision-forms')
const { installToolkitDecisionForms } = await import('./decision-forms')
const { metricsPlan, runToolkitMetrics } = await import('./metrics')
const { unknownCapabilityWarnings } = await import('./capabilities')
const { registerSpillConnectors } = await import('./connectors/spill')
const { resolveToolkits } = await import('./registry')
const { runGenerator } = await import('../case-data/generators')
const { createProject } = await import('../project/store')
const { createScenario, updateScenario } = await import('../scenario/store')
const { sessionFolder } = await import('../live/log-read')
const { ScenarioBrief } = await import('@shared/schemas')
await import('./spill/generators')

const SESSION = 'sess-1'
const START = '2026-11-04T12:00:00.000Z'
const at = (min: number): string => new Date(Date.parse(START) + min * 60_000).toISOString()

afterAll(() => provideDecisionForms(undefined))

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-spill-live-'))
  const { path: root } = await createProject({
    parentDir: parent,
    name: 'Terminal',
    orgType: 'environmental_response',
  })
  const scenario = await createScenario(root, {
    title: 'Tank 14',
    brief: ScenarioBrief.parse({ userPrompt: 'A worst case discharge reaches the marsh.' }),
  })
  await updateScenario(root, scenario.id, (s) => void (s.toolkits = ['spill_plume']), {
    by: 'user',
  })
  // Oil released near two shorelines: the marsh to the north is reached, the far bar is not.
  await runGenerator(
    root,
    scenario.id,
    'spill-simulation',
    {
      start: START,
      origin: { lat: 30.3, lon: -88.1 },
      product: 'diesel',
      volume: 4200,
      unit: 'bbl',
      releaseHours: 2,
      hours: 24,
      stepHours: 1,
      windFromDeg: 180,
      windMs: 8,
      currentTowardDeg: 0,
      currentMs: 0.3,
      shorelines: [
        {
          id: 'marsh',
          name: 'Heron Bay marsh',
          points: [
            { lat: 30.33, lon: -88.2 },
            { lat: 30.33, lon: -88.0 },
          ],
        },
        {
          id: 'bar',
          name: 'Far bar',
          points: [
            { lat: 29.5, lon: -88.2 },
            { lat: 29.5, lon: -88.0 },
          ],
        },
      ],
      notifications: [
        { who: 'National Response Center', minutes: 30 },
        { who: 'State environmental agency', minutes: 120 },
      ],
    },
    { maxMbPerScenario: 50 },
  )
  return { root, scenarioId: scenario.id }
}

function decision(
  i: number,
  id: string,
  kind: string,
  minute: number,
  area?: string,
  fields: Record<string, string> = {},
) {
  return {
    i,
    at: at(minute + 5),
    kind: 'decision.submitted',
    actor: { kind: 'controller' },
    data: {
      structured: {
        id,
        time: at(minute),
        kind,
        ...(area ? { area: { id: area.toLowerCase().replace(/\W+/g, '_'), name: area } } : {}),
        fields,
      },
    },
  }
}

describe('the spill_plume toolkit in live play and Evaluation', () => {
  it('names nothing the app has no code for', async () => {
    registerSpillConnectors()
    const [toolkit] = await resolveToolkits(['spill_plume'])
    expect(unknownCapabilityWarnings(toolkit!)).toEqual([])
  })

  it('offers its ten decisions as live forms, with the shorelines the oil reaches as the places', async () => {
    const before = provideDecisionForms(undefined)
    installToolkitDecisionForms()
    const { root, scenarioId } = await setup()
    const forms = await decisionFormsFor({ root, scenarioId })
    expect(forms.map((f) => f.id)).toEqual([
      'make_notifications',
      'activate_osro',
      'set_protection_priorities',
      'deploy_protective_boom',
      'request_countermeasure',
      'close_water_intake',
      'close_fishery_or_shoreline',
      'set_safety_zone',
      'escalate_imt',
      'issue_public_statement',
    ])
    const boom = forms.find((f) => f.id === 'deploy_protective_boom')!
    expect(boom.fields.find((f) => f.id === 'site')).toMatchObject({
      type: 'area',
      areas: [
        { id: 'heron_bay_marsh', label: 'Heron Bay marsh' },
        { id: 'far_bar', label: 'Far bar' },
      ],
    })
    provideDecisionForms(before)
  })

  it('plans the four metrics and scores the decisions from the session log', async () => {
    const { root, scenarioId } = await setup()
    const plan = await metricsPlan(root, scenarioId)
    expect(plan.metrics.map((m) => m.id)).toEqual([
      'spill_notification_timeliness',
      'threshold_timing',
      'protection_coverage',
      'message_consistency',
    ])
    const dir = sessionFolder(root, scenarioId, SESSION)
    mkdirSync(dir, { recursive: true })
    const entries = [
      decision(1, 'd1', 'make_notifications', 20, undefined, { who: 'national_response_center' }),
      decision(2, 'd2', 'make_notifications', 150, undefined, {
        who: 'state_environmental_agency',
      }),
      decision(3, 'd3', 'deploy_protective_boom', 30, 'Heron Bay marsh'),
    ]
    writeFileSync(join(dir, 'log.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
    const run = await runToolkitMetrics(root, scenarioId, { sessionId: SESSION })
    const byId = Object.fromEntries(run.results.map((r) => [r.metricId, r]))
    expect(Object.keys(byId).sort()).toEqual([
      'message_consistency',
      'protection_coverage',
      'spill_notification_timeliness',
      'threshold_timing',
    ])
    expect(run.skipped).toEqual([])
    // The NRC was called at minute 20 for a 30-minute deadline: met, 10 minutes early. The state
    // was called at 150 for a 120-minute deadline: 30 minutes late.
    expect(byId.spill_notification_timeliness!.data).toMatchObject({ met: 1, late: 1, missed: 0 })
    expect(byId.spill_notification_timeliness!.title).toBe('Notification timeliness')
    // Boom went to the marsh at minute 30, long before the oil arrives; the far bar is never reached.
    expect(byId.protection_coverage!.data).toMatchObject({ protected: 1, unprotected: 0, late: 0 })
    expect(byId.threshold_timing!.title).toBe('Protective boom before oil arrives')
    expect(byId.protection_coverage!.title).toBe('Sensitive areas protected before landfall')
  })
})
