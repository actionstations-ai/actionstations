// Model-assisted control mapping (spec 0426 FR-12): off unless the project allows it, suggestions
// only (nothing stored), invented control references dropped.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { runSuggestModel, checkedSuggestions } = await import('./suggest-model')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { setPipelineDeps } = await import('../generate/deps')
const { FakeNciaIndex, ScriptedProvider } = await import('../../../tests/fixtures/generate/fakes')
const { createProject, updateProject } = await import('../project/store')
const { createScenario, saveScenario } = await import('../scenario/store')
const { branchedScenario, mselRow } = await import('@shared/branching/fixture')
const { ScenarioBrief } = await import('@shared/schemas')

async function setup(provider: InstanceType<typeof ScriptedProvider>, modelMapping: boolean) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  setPipelineDeps({
    openIndex: async () => new FakeNciaIndex(),
    resolveTextProvider: async () => ({ provider, model: 'scripted', providerId: 'scripted' }),
  })
  const parent = mkdtempSync(join(tmpdir(), 'ttx-cmap-'))
  const { path: root } = await createProject({
    parentDir: parent,
    name: 'NCIA',
    orgType: 'airport',
  })
  await updateProject(root, (p) => {
    p.compliance = { regulations: {}, frameworks: { nist_csf_2: true }, modelMapping }
  })
  const created = await createScenario(root, { title: 'Map', brief: ScenarioBrief.parse({}) })
  const b = branchedScenario()
  await saveScenario(
    root,
    {
      ...created,
      phases: [{ id: 'p1', index: 0, title: 'One', goal: 'g', startTime: '0:00', endTime: '4:00' }],
      msel: b.msel,
    },
    { by: 'user' },
  )
  return { root, scenarioId: created.id }
}
afterEach(() => setPipelineDeps(undefined))

const run = (root: string, scenarioId: string, rowIds?: string[]) =>
  jobs.wait(
    jobs.start('compliance-map', (ctx) => runSuggestModel(root, scenarioId, rowIds, ctx), {
      projectPath: root,
      scenarioId,
    }).id,
  )

describe('runSuggestModel', () => {
  it('returns checked suggestions, drops invented references, and leaves scenario.json alone', async () => {
    const reply = {
      rows: [
        { rowId: 'I-11a', controls: ['nist_csf_2:RS.CO-02', 'nist_csf_2:NOT.REAL', 'other:X'] },
        { rowId: 'I-404', controls: ['nist_csf_2:RS.CO-02'] },
      ],
    }
    const provider = new ScriptedProvider(() => JSON.stringify(reply))
    const { root, scenarioId } = await setup(provider, true)
    const file = join(root, 'scenarios', scenarioId, 'scenario.json')
    const before = readFileSync(file, 'utf8')
    const job = await run(root, scenarioId)
    expect(job.status, job.error).toBe('done')
    expect(job.result).toEqual({ suggestions: [{ rowId: 'I-11a', ref: 'nist_csf_2:RS.CO-02' }] })
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('refuses without a model call when the project has not allowed it', async () => {
    const provider = new ScriptedProvider(() => '{"rows":[]}')
    const { root, scenarioId } = await setup(provider, false)
    const job = await run(root, scenarioId)
    expect(job.status).toBe('error')
    expect(job.error).toContain('off for this project')
    expect(provider.requests).toHaveLength(0)
  })

  it('sends the control list and the row text as data, and no control cards', async () => {
    const provider = new ScriptedProvider(() => '{"rows":[]}')
    const { root, scenarioId } = await setup(provider, true)
    await run(root, scenarioId)
    const user = provider.requests[0]!.messages.map((m) => m.content).join('\n')
    expect(user).toContain('<controls>')
    expect(user).toContain('nist_csf_2:RS.CO-02')
    expect(user).toContain('I-11a')
    expect(user).not.toContain('[STARTEX]')
  })
})

describe('checkedSuggestions', () => {
  it('skips controls a row already has and caps a row at five', () => {
    const row = mselRow('I-01', '1:00', { controls: ['f:A'] })
    const valid = new Set(['f:A', 'f:B', 'f:C', 'f:D', 'f:E', 'f:F', 'f:G'])
    const out = checkedSuggestions(
      { rows: [{ rowId: 'I-01', controls: ['f:A', 'f:B', 'f:C', 'f:D', 'f:E', 'f:F', 'f:G'] }] },
      [row],
      valid,
    )
    expect(out.map((s) => s.ref)).toEqual(['f:B', 'f:C', 'f:D', 'f:E', 'f:F'])
  })
})
