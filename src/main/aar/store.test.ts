// aar.json and documents/aar.md (#419, FR-6): atomic writes with history, stale and busy
// conflicts, and the document re-rendered around the prose a person edited.
import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Aar } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { readAar, syncAarDocument, writeAar } = await import('./store')
const { sectionBody, upsertSection } = await import('./markdown')
const { createProject } = await import('../project/store')
const { createScenario, readScenarioDoc, saveScenario, writeScenarioDoc } = await import(
  '../scenario/store'
)
const { claimScenario } = await import('../scenario/busy')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-aar-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'NCIA' })
  const created = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  const scenario = Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId })
  await saveScenario(root, scenario, { by: 'user' })
  return { root, scenarioId: created.id }
}

const NOW = '2026-10-28T18:00:00.000Z'
const aar = (over: Partial<Aar> = {}): Aar => ({
  formatVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  executiveSummaryMd: 'Summary.',
  sourcesUsed: ['facilitator'],
  capabilities: [
    {
      capability: 'operational_coordination',
      proposedRating: 'S',
      ratingRationale: 'r',
      observationCounts: { met: 0, partial: 0, not_met: 0, not_observed: 0 },
      objectiveRefs: [],
      strengths: [],
      areasForImprovement: [],
    },
  ],
  participantFeedbackMd: '',
  participatingOrganizations: [],
  acronyms: [],
  provenance: [],
  ...over,
})

describe('AAR store', () => {
  it('reads null before the first draft, then the written file with a fresh updatedAt', async () => {
    const { root, scenarioId } = await setup()
    expect(await readAar(root, scenarioId)).toBeNull()
    const saved = await writeAar(root, scenarioId, aar(), { by: 'ai', note: 'draft' })
    expect(saved.updatedAt > NOW).toBe(true)
    expect(existsSync(join(root, 'scenarios', scenarioId, 'aar.json'))).toBe(true)
    expect(existsSync(join(root, 'scenarios', scenarioId, 'history', 'aar-json.jsonl'))).toBe(true)
    expect((await readAar(root, scenarioId))!.executiveSummaryMd).toBe('Summary.')
  })

  it('refuses a stale base and a save while a job owns the scenario', async () => {
    const { root, scenarioId } = await setup()
    const first = await writeAar(root, scenarioId, aar(), { by: 'ai' })
    await writeAar(root, scenarioId, { ...first, executiveSummaryMd: 'Newer' }, { by: 'user' })
    await expect(
      writeAar(root, scenarioId, first, { by: 'user', baseUpdatedAt: first.updatedAt }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'stale' } })
    const release = claimScenario(root, scenarioId, 'job-1')
    try {
      await expect(writeAar(root, scenarioId, first, { by: 'user' })).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    } finally {
      release()
    }
  })

  it('renders the document in full, then refreshes only the tables around edited prose', async () => {
    const { root, scenarioId } = await setup()
    const saved = await writeAar(root, scenarioId, aar(), { by: 'ai' })
    const md = await syncAarDocument(root, scenarioId, saved, 'full', { by: 'ai' })
    expect(await readScenarioDoc(root, scenarioId, 'aar')).toBe(md)
    expect(md).toContain('# After-Action Report / Improvement Plan')
    expect(sectionBody(md, 'ratings')).toContain('Rating pending')
    const edited = upsertSection(md, 'summary', '## Executive Summary\n\nThe director wrote this.')
    await writeScenarioDoc(root, scenarioId, 'aar', edited, { by: 'user' })
    const confirmed = {
      ...saved,
      capabilities: saved.capabilities.map((c) => ({ ...c, rating: 'S' as const })),
    }
    const refreshed = await syncAarDocument(root, scenarioId, confirmed, 'refresh', { by: 'user' })
    expect(sectionBody(refreshed, 'summary')).toContain('The director wrote this.')
    expect(sectionBody(refreshed, 'ratings')).not.toContain('Rating pending')
    expect(sectionBody(refreshed, 'ratings')).toContain('| X |')
    expect(await readScenarioDoc(root, scenarioId, 'aar')).toBe(refreshed)
  })
})
