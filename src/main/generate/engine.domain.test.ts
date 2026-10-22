// The pipeline on a transit project against reference/transit with a scripted provider
// (ADR-0014): the brief's threat family is settled at creation, every stage's prompt carries
// the transit profile and the cyber-physical arc, the facility sheet lists transit
// identifiers, and no airport vocabulary reaches the model unless the documents use it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { ChatRequest } from '../providers/types'
import { ScriptedProvider } from '../../../tests/fixtures/generate/fakes'
import { RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'
import { AIRPORT_WORDS, FakeCorpusIndex } from '../../../tests/fixtures/domains/fake-index'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: generateHandlers } = await import('../ipc/handlers/generate')
const { default: jobHandlers } = await import('../ipc/handlers/jobs')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { MOCK_FIXTURES } = await import('../providers/mock/fixtures')
const { setPipelineDeps } = await import('./deps')
const { getScenario } = await import('../scenario/store')
const { extractFacilityFacts } = await import('./facility')
const { categoriesForProfile } = await import('./domain')
const { builtinProfile } = await import('@shared/domains')
const { referenceTexts } = await import('../../../tests/fixtures/domains/fake-index')

const handlers = { ...projectHandlers, ...generateHandlers, ...jobHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

/** The mock fixtures, served through a scripted provider so every request is recorded. */
function fixtureProvider(): ScriptedProvider {
  return new ScriptedProvider((req: ChatRequest) => {
    const name = (req.json as { name?: string } | undefined)?.name ?? ''
    if (name === 'MselPhaseOutput') return JSON.stringify(mselResponder(req))
    if (name === 'RubricOutput') return JSON.stringify(RUBRIC)
    return JSON.stringify(MOCK_FIXTURES[name as keyof typeof MOCK_FIXTURES] ?? {})
  })
}

let projectPath: string
let provider: ScriptedProvider

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-dom-'))
  projectPath = (
    await invoke('project:create', {
      parentDir,
      name: 'Riverbend Regional Transit Authority',
      orgName: 'Riverbend Regional Transit Authority',
      orgType: 'transit',
    })
  ).path
  // The facts the documents state, as the ingest would have written them.
  const facts = extractFacilityFacts(
    referenceTexts('reference/transit'),
    categoriesForProfile(builtinProfile('transit')),
  )
  const { renderFacilityFile } = await import('./facility-file')
  mkdirSync(projectPath, { recursive: true })
  writeFileSync(join(projectPath, 'facility-facts.md'), renderFacilityFile(facts))
  provider = fixtureProvider()
  setPipelineDeps({
    openIndex: async () => new FakeCorpusIndex('reference/transit'),
    resolveTextProvider: async () => ({ provider, model: 'scripted', providerId: 'scripted' }),
  })
})
afterEach(() => setPipelineDeps(undefined))

const brief = {
  userPrompt:
    'Someone is feeding fake positions into the CAD/AVL system and buses are being dispatched to the wrong routes',
  audience: ['Operations', 'IT/OT', 'PIO', 'Transit Police'],
  durationHours: 4,
  phaseCount: 4,
  learningObjectives: [],
  constraints: [],
  startWallClock: '06:00',
}

const promptText = (req: ChatRequest): string =>
  [req.system ?? '', ...req.messages.map((m) => m.content)].join('\n')

describe('scenario pipeline on a transit project (scripted fixtures, reference/transit)', () => {
  it('settles the threat family, briefs every stage with the transit profile, and leaks no airport words', async () => {
    const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    const s = await getScenario(projectPath, scenarioId)
    expect(s.brief.threatFamily).toBe('cyber_physical')
    expect(s.status).toBe('ready')

    const requests = provider.requests
    expect(requests.length).toBeGreaterThanOrEqual(9)
    const stageOf = (req: ChatRequest): string =>
      (req.json as { name?: string } | undefined)?.name ?? ''
    const phasePlan = requests.find((r) => stageOf(r) === 'PhasePlanOutput')!
    expect(promptText(phasePlan)).toContain('Cyber-physical incident')
    expect(promptText(phasePlan)).toContain('Loss of Control')
    expect(promptText(phasePlan)).not.toContain('Manual Mode')
    const msel = requests.filter((r) => stageOf(r) === 'MselPhaseOutput')
    expect(msel.length).toBeGreaterThanOrEqual(4)
    const mselText = promptText(msel[0]!)
    expect(mselText).toContain('Transit (bus / rail)')
    expect(mselText).toMatch(/Bus routes \(the complete list\)/)
    expect(mselText).toContain('info_display_board')
    expect(mselText).not.toMatch(/\bfids_board\b/)
    const roles = requests.find((r) => stageOf(r) === 'ObjectivesRolesOutput')!
    expect(promptText(roles)).toContain('Chief of Transit Police')

    // No airport vocabulary reaches the model from the prompts and the profile. The style
    // examples and the fixtures are the only allowed sources, so strip what the mock
    // scenario state (Scenario 3 rows) echoes back, then look at what remains.
    const documentsUse = new Set(
      referenceTexts('reference/transit')
        .join('\n')
        .match(new RegExp(AIRPORT_WORDS.source, 'gi'))
        ?.map((w) => w.toLowerCase()) ?? [],
    )
    for (const req of requests) {
      const system = req.system ?? ''
      const hits = (system.match(new RegExp(AIRPORT_WORDS.source, 'gi')) ?? [])
        .map((w) => w.toLowerCase())
        .filter((w) => !documentsUse.has(w))
      expect(hits, `${stageOf(req)} system prompt: ${hits.join(', ')}`).toEqual([])
    }
  })
})
