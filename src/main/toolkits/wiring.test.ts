// Integration: a scenario's toolkits reach the machinery (spec 0448): decision forms for live
// play and Facilitate, metrics at evaluation, lint rules over its injects, and warnings for ids
// the app has no code for. One bundled pack carries the wired_field fixture toolkit.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const fixturePath = resolve('tests/fixtures/toolkits/wired_field.json')

vi.mock('../packs/layers', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  const pack = {
    id: 'ai.actionstations.wired-pack',
    version: '1.0.0',
    name: 'Wired pack',
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
        toolkits: ['wired_field'],
      },
    },
    items: [],
  }
  return {
    ...original,
    enabledPacks: () => [],
    bundledPacks: () => [pack],
    packsRevision: () => 1,
    packItemPath: () => fixturePath,
  }
})

const { decisionFormsFor, provideDecisionForms } = await import('../live/decision-forms')
const { installToolkitDecisionForms, liveFormsOf } = await import('./decision-forms')
const { metricsPlan, runToolkitMetrics } = await import('./metrics')
const { toolkitLintWarnings, unknownRuleIds } = await import('./lint')
const { unknownCapabilityWarnings } = await import('./capabilities')
const { registerFieldLintRule } = await import('./field-lint')
const { resolveToolkits } = await import('./registry')
const { createProject } = await import('../project/store')
const { createScenario, getScenario, saveInject, updateScenario } =
  await import('../scenario/store')
const { writeCaseFile, writeManifest } = await import('../case-data/store')
const { readEvaluation, saveMetricInputs } = await import('../evaluation/store')
const { sessionFolder } = await import('../live/log-read')
const { ScenarioBrief } = await import('@shared/schemas')
const { Inject } = await import('@shared/schemas/inject')

registerFieldLintRule({
  id: 'wired_rule',
  injectTypes: ['wired_bulletin'],
  check: (fields) =>
    fields.level === 'Warning' && !fields.area
      ? [{ path: 'fields.area', message: 'A warning needs an area' }]
      : [],
})

const SESSION = 'sess-1'

async function setup(toolkits: string[] = ['wired_field']) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-wire-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'Org', orgType: 'airport' })
  const scenario = await createScenario(root, {
    title: 'Drill',
    brief: ScenarioBrief.parse({ userPrompt: 'A storm crosses the harbor.' }),
  })
  await updateScenario(root, scenario.id, (s) => void (s.toolkits = toolkits), { by: 'user' })
  return { root, scenarioId: scenario.id }
}

afterAll(() => provideDecisionForms(undefined))

describe('decision forms from toolkits', () => {
  it('offers the live form of each toolkit the scenario has on, and none after it is off', async () => {
    const before = provideDecisionForms(undefined)
    installToolkitDecisionForms()
    const { root, scenarioId } = await setup()
    const forms = await decisionFormsFor({ root, scenarioId })
    expect(forms).toHaveLength(1)
    expect(forms[0]).toMatchObject({ id: 'issue_bulletin', title: 'Issue a bulletin' })
    const level = forms[0]!.fields.find((f) => f.id === 'level')
    expect(level).toMatchObject({
      type: 'choice',
      required: true,
      options: [
        { id: 'advisory', label: 'Advisory' },
        { id: 'warning', label: 'Warning' },
      ],
    })
    // An area field with no list offers the exercise area.
    expect(forms[0]!.fields.find((f) => f.id === 'area')).toMatchObject({
      type: 'area',
      areas: [{ id: 'exercise_area', label: 'Exercise area' }],
    })

    await updateScenario(root, scenarioId, (s) => void (s.toolkits = []), { by: 'user' })
    expect(await decisionFormsFor({ root, scenarioId })).toEqual([])
    provideDecisionForms(before)
  })

  it('numbers option ids when two labels would share one and uses a named area list', async () => {
    const [toolkit] = await resolveToolkits(['wired_field'])
    const custom = {
      ...toolkit!,
      decisionForms: [
        {
          id: 'order',
          label: 'Order',
          description: '',
          fields: [
            {
              id: 'how',
              label: 'How',
              kind: 'choice' as const,
              required: false,
              choices: ['Go!', 'Go?'],
              areas: [],
              draw: false,
            },
            {
              id: 'where',
              label: 'Where',
              kind: 'area' as const,
              required: false,
              choices: [],
              areas: ['North pier', 'South pier'],
              draw: true,
            },
          ],
        },
      ],
    }
    const [form] = liveFormsOf([custom]) as { fields: Record<string, unknown>[] }[]
    expect((form!.fields[0] as { options: { id: string }[] }).options.map((o) => o.id)).toEqual([
      'go',
      'go_2',
    ])
    expect(form!.fields[1]).toMatchObject({
      draw: true,
      areas: [{ id: 'north_pier' }, { id: 'south_pier' }],
    })
  })
})

describe('toolkit metrics at evaluation', () => {
  async function withSession() {
    const ctx = await setup()
    await writeCaseFile(
      ctx.root,
      ctx.scenarioId,
      'truth.json',
      JSON.stringify([{ id: 'e1', time: '2026-09-01T12:30:00.000Z', kind: 'storm' }]),
    )
    await writeManifest(ctx.root, ctx.scenarioId, {
      version: 1,
      datasets: [
        {
          id: 'truth',
          kind: 'reports',
          label: 'Storm reports',
          provenance: {
            origin: 'simulated',
            source: 'test',
            generator: 'test-gen',
            terms: '',
          } as never,
          file: 'truth.json',
          bytes: 10,
        },
      ],
    })
    const dir = sessionFolder(ctx.root, ctx.scenarioId, SESSION)
    mkdirSync(dir, { recursive: true })
    const decision = {
      i: 1,
      at: '2026-09-01T12:10:00.000Z',
      kind: 'decision.submitted',
      actor: { kind: 'controller' },
      data: {
        structured: {
          id: 'dec-1',
          time: '2026-09-01T12:00:00.000Z',
          kind: 'issue_bulletin',
          area: { id: 'harbor', name: 'Harbor' },
          fields: { level: 'warning' },
        },
      },
    }
    writeFileSync(join(dir, 'log.jsonl'), JSON.stringify(decision) + '\n')
    return ctx
  }

  it('plans the configured metrics and flags missing key facts', async () => {
    const { root, scenarioId } = await setup()
    const plan = await metricsPlan(root, scenarioId)
    expect(plan.metrics.map((m) => [m.id, m.title, m.needsKeyFacts])).toEqual([
      ['decision_timing', 'Bulletin lead time', false],
      ['message_consistency', 'Message consistency', true],
      ['no_such_metric', 'no_such_metric', false],
    ])
    const off = await setup([])
    expect((await metricsPlan(off.root, off.scenarioId)).metrics).toEqual([])
  })

  it('scores the session log decisions against the case ground truth and stores the results', async () => {
    const { root, scenarioId } = await withSession()
    await saveMetricInputs(root, scenarioId, {
      keyFacts: [{ id: 'eta', label: 'Landfall time' }],
      factStatements: [
        { factId: 'eta', partner: 'County', value: '14:00' },
        { factId: 'eta', partner: 'City', value: '14:00' },
        { factId: 'gone', partner: 'City', value: 'dropped' },
      ],
    })
    const run = await runToolkitMetrics(root, scenarioId, { sessionId: SESSION })
    expect(run.results.map((r) => r.metricId)).toEqual(['decision_timing', 'message_consistency'])
    expect(run.skipped).toEqual([
      { id: 'no_such_metric', reason: 'The app has no metric with this id.' },
    ])
    const timing = run.results[0]!
    expect(timing.title).toBe('Bulletin lead time')
    expect(timing.sessionId).toBe(SESSION)
    expect(timing.summary.some((m) => /lead/i.test(m.label) && /30/.test(m.value))).toBe(true)

    const stored = await readEvaluation(root, scenarioId)
    expect(stored.metricResults).toHaveLength(2)
    expect(stored.factStatements).toHaveLength(2)
    // A refresh replaces the stored result instead of adding a copy.
    await runToolkitMetrics(root, scenarioId, { sessionId: SESSION })
    expect((await readEvaluation(root, scenarioId)).metricResults).toHaveLength(2)
  })

  it('skips a metric whose ground-truth dataset is not in the scenario', async () => {
    const { root, scenarioId } = await setup()
    const run = await runToolkitMetrics(root, scenarioId)
    const skip = run.skipped.find((s) => s.id === 'decision_timing')
    expect(skip?.reason).toMatch(/"truth" is not in this scenario/)
    expect(run.results.map((r) => r.metricId)).toEqual(['message_consistency'])
  })
})

describe('toolkit lint rules', () => {
  const inject = (fields: Record<string, unknown>) =>
    Inject.parse({
      id: 'inj-1',
      mselRowId: 'I-01',
      type: 'wired_bulletin',
      title: 'Bulletin',
      fields,
    })

  it('reports rule findings on the scenario injects when a toolkit lists rules', async () => {
    const { root, scenarioId } = await setup()
    await saveInject(root, scenarioId, inject({ level: 'Warning' }), { by: 'user' })
    const scenario = await getScenario(root, scenarioId)
    const warnings = await toolkitLintWarnings(root, scenario)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      code: 'TOOLKIT_LINT',
      injectId: 'inj-1',
      rowId: 'I-01',
    })
    expect(warnings[0]!.message).toContain('A warning needs an area')
  })

  it('adds nothing for a scenario without toolkits', async () => {
    const { root, scenarioId } = await setup([])
    await saveInject(root, scenarioId, inject({ level: 'Warning' }), { by: 'user' })
    expect(await toolkitLintWarnings(root, await getScenario(root, scenarioId))).toEqual([])
  })
})

describe('ids the app has no code for', () => {
  it('lists each unknown figure, connector, metric and lint rule id', async () => {
    const [toolkit] = await resolveToolkits(['wired_field'])
    expect(unknownCapabilityWarnings(toolkit!)).toEqual([
      'The app has no figure kind "no_such_figure"; it is ignored.',
      'The app has no data connector "no_such_connector"; it is ignored.',
      'The app has no metric "no_such_metric"; it is ignored.',
      'The app has no lint rule "no_such_rule"; it is ignored.',
    ])
    expect(unknownRuleIds(['wired_rule', 'no_such_rule'])).toEqual(['no_such_rule'])
  })

  it('is silent for a toolkit that names only known ids', () => {
    expect(
      unknownCapabilityWarnings({
        figureKinds: ['time_series'],
        connectors: [],
        metrics: [{ id: 'decision_timing', config: {} }],
        lintRules: ['wired_rule'],
      }),
    ).toEqual([])
  })
})
