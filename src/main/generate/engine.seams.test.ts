// Plan seams through the whole pipeline (#427) on the planted three-plan corpus from #423:
// the plan check's findings are written to plan-conflicts.json, two seams are picked in the
// brief, and the mock provider generates the scenario. Each seam leaves the pipeline with a
// row citing both passages, the inject for that row carries the controller block, the
// handbook gets its seams section and the hot wash one question per seam. A model that tags
// its own seam row (phase plan places, MSEL row says "seam") is used as written.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Chunk, PlanFinding, SearchHit } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import type { SearchOptions } from '../retrieve/types'
import { FakeNciaIndex } from '../../../tests/fixtures/generate/fakes'
import { RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'
import {
  fakeRenderer,
  injectTextResponder,
  makeTestResources,
  mediaBriefResponder,
} from '../../../tests/fixtures/injects/fixtures'
import { loadConflictCorpus } from '../grounding/fixtures/conflict-corpus.test-helper'
import { candidatePairs, danglingFindings } from '../grounding/plan-check'
import { MOCK_FIXTURES } from '../providers/mock/fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = makeTestResources()

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: generateHandlers } = await import('../ipc/handlers/generate')
const { default: injectHandlers } = await import('../ipc/handlers/injects')
const { default: jobHandlers } = await import('../ipc/handlers/jobs')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../providers/mock/adapter')
const { setPipelineDeps } = await import('./deps')
const { setInjectDeps } = await import('./injects/deps')
const { getScenario, readScenarioDoc } = await import('../scenario/store')
const { writeConflicts } = await import('../grounding/conflicts-file')

const handlers = { ...projectHandlers, ...generateHandlers, ...injectHandlers, ...jobHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

/** The planted plans, their chunk ids moved clear of the NCIA corpus's. */
const OFFSET = 100_000
const now = '2026-10-28T12:00:00.000Z'
const corpus = loadConflictCorpus().map((d) => ({
  ...d,
  chunks: d.chunks.map((c) => ({ ...c, chunkId: c.chunkId + OFFSET })),
}))
const findings: PlanFinding[] = [
  ...candidatePairs(corpus, { withinDocument: false, now }).map((c) => c.finding),
  ...danglingFindings(corpus, [], now),
]
const bySlot = (slot: string): PlanFinding => findings.find((f) => f.slot === slot)!
const approver = bySlot('release_approver')
const deadline = bySlot('notify_deadline')

/** The NCIA keyword index plus the planted plans, so pinned passages resolve by chunk id. */
class SeamIndex extends FakeNciaIndex {
  constructor() {
    super()
    for (const d of corpus)
      d.chunks.forEach((c, ord) =>
        this.chunks.push({
          id: c.chunkId,
          documentId: d.id,
          documentTitle: d.title,
          headingPath: c.headingPath,
          ord,
          text: c.text,
          tokenCount: 10,
        } as Chunk & { documentTitle: string }),
      )
  }
  override async search(q: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    // The passages arrive by pinning only: retrieval never returns them on its own.
    return (await super.search(q, opts)).filter((h) => h.chunkId < OFFSET)
  }
}

let projectPath: string
let requests: ChatRequest[]

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-seams-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'HVWA', orgType: 'airport' }))
    .path
  await writeConflicts(projectPath, { formatVersion: 1, checkedAt: now, documents: [], findings })
  const index = new SeamIndex()
  setPipelineDeps({ openIndex: async () => index })
  setInjectDeps({ renderer: fakeRenderer, applyPostFx: undefined })
  requests = []
  setMockResponse('MselPhaseOutput', (req) => {
    requests.push(req)
    return mselResponder(req)
  })
  setMockResponse('RubricOutput', () => RUBRIC)
  setMockResponse('InjectTextOutput', injectTextResponder)
  setMockResponse('MediaBriefOutput', mediaBriefResponder)
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
  setInjectDeps(undefined)
})

const brief = {
  userPrompt: 'A loss of treatment at the main plant with a boil water notice',
  audience: ['Airport Operations', 'IT', 'PIO', 'Security'],
  durationHours: 4,
  phaseCount: 4,
  learningObjectives: [],
  constraints: [],
  startWallClock: '09:00',
  seamIds: [approver.id, deadline.id],
}

async function generate() {
  const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
  const job = await jobs.wait(jobId)
  expect(job.status, job.error).toBe('done')
  return { scenarioId, s: await getScenario(projectPath, scenarioId) }
}

const userOf = (req: ChatRequest): string =>
  String(req.messages.find((m) => m.role === 'user')?.content ?? '')

describe('plan seams in the pipeline (mock provider, planted corpus)', () => {
  it('leaves each seam with a row that cites both passages and a code-built controller note', async () => {
    const { scenarioId, s } = await generate()
    expect(s.seams.map((x) => x.id)).toEqual([approver.id, deadline.id])
    // The mock phase plan places nothing: deadlines go first, the approver to the decision phase.
    expect(s.seams[0]!.phaseId).toBe(s.phases[2]!.id)
    expect(s.seams[1]!.phaseId).toBe(s.phases[0]!.id)
    for (const seam of s.seams) {
      const rows = s.msel.filter((r) => r.seamId === seam.id)
      expect(rows.length, seam.slotLabel).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.phaseId).toBe(seam.phaseId)
        const cited = row.citations.map((c) => c.chunkId)
        expect(cited).toEqual(expect.arrayContaining([seam.a.chunkId, seam.b!.chunkId]))
        expect(['NOISE', 'RED_HERRING']).not.toContain(row.purposeTag)
      }
    }
    expect(s.warnings.map((w) => w.code)).not.toContain('SEAM_NOT_TESTED')
    expect(s.warnings.filter((w) => w.code === 'SEAM_ROW_ASSIGNED')).toHaveLength(2)

    // The seam passages were pinned into the phase's prompt as its first citation keys.
    const decision = requests.find((r) => userOf(r).includes('NOW WRITE PHASE 3'))!
    expect(userOf(decision)).toContain('PLAN SEAMS for this phase')
    expect(userOf(decision)).toContain('S1: Who approves public releases')
    expect(String(decision.cacheableContext ?? decision.system)).toContain('<document key="C1"')
    const phase2 = requests.find((r) => userOf(r).includes('NOW WRITE PHASE 2'))!
    expect(userOf(phase2)).not.toContain('PLAN SEAMS')

    const handbook = await readScenarioDoc(projectPath, scenarioId, 'handbook')
    expect(handbook).toContain('### Plan seams this exercise tests')
    expect(handbook).toContain('Who approves public releases')
    expect(handbook).toContain(approver.a.span.slice(0, 40))
    const seamQs = s.hotwash!.questions.filter((q) => q.topic === 'Plan seam')
    expect(seamQs).toHaveLength(2)
    expect(seamQs[0]!.rowIds).toEqual(
      s.msel.filter((r) => r.seamId === approver.id).map((r) => r.id),
    )
    const briefing = await readScenarioDoc(projectPath, scenarioId, 'briefing')
    expect(briefing).not.toContain('Plan seam')
    expect(briefing).not.toContain(approver.a.span.slice(0, 40))

    const seamRow = s.msel.find((r) => r.seamId === approver.id)!
    const { jobId } = await invoke('generate:injects', {
      projectPath,
      scenarioId,
      rowIds: [seamRow.id],
    })
    expect((await jobs.wait(jobId)).status).toBe('done')
    const inject = (await invoke('injects:list', { projectPath, scenarioId })).find(
      (i) => i.mselRowId === seamRow.id,
    )!
    expect(inject.instructorNote).toMatch(/^Watch .*\n\nPlan seam( \(unconfirmed\))?: Who approves/)
    expect(inject.instructorNote).toContain('Watch for: whether players notice the conflict')
    expect(inject.citations.map((c) => c.chunkId)).toEqual(
      expect.arrayContaining([approver.a.chunkId, approver.b!.chunkId]),
    )
    // Regenerating rebuilds the block instead of adding a second one.
    const again = await invoke('generate:injects', {
      projectPath,
      scenarioId,
      rowIds: [seamRow.id],
    })
    await jobs.wait(again.jobId)
    const regenerated = (await invoke('injects:list', { projectPath, scenarioId })).find(
      (i) => i.mselRowId === seamRow.id,
    )!
    expect(regenerated.instructorNote?.match(/Plan seam/g)).toHaveLength(1)
  })

  it('uses the phase plan’s placement and the row the model tagged', async () => {
    setMockResponse('PhasePlanOutput', () => ({
      ...(MOCK_FIXTURES.PhasePlanOutput as object),
      seamPhases: [
        { seam: 'S1', phase: 2 },
        { seam: 's2', phase: 2 },
      ],
    }))
    setMockResponse('MselPhaseOutput', (req) => {
      const out = mselResponder(req)
      if (!userOf(req).includes('NOW WRITE PHASE 2')) return out
      const rows = out.rows.map((r) => ({ ...r }))
      const story = rows.find((r) => r.purposeTag === 'CORE_NARRATIVE')!
      story.seam = 'S1'
      const noise = rows.find((r) => r.purposeTag === 'NOISE')
      if (noise) noise.seam = 'S2'
      return { rows }
    })
    const { s } = await generate()
    expect(s.seams.every((x) => x.phaseId === s.phases[1]!.id)).toBe(true)
    const tagged = s.msel.filter((r) => r.seamId === approver.id)
    expect(tagged.length).toBeGreaterThan(0)
    expect(
      s.warnings.some((w) => w.code === 'SEAM_ROW_ASSIGNED' && w.rowId === tagged[0]!.id),
    ).toBe(false)
    // A NOISE row the model gave a seam is re-tagged: players must not dismiss it (FR-6).
    for (const row of s.msel.filter((r) => r.seamId === deadline.id))
      expect(['NOISE', 'RED_HERRING']).not.toContain(row.purposeTag)
  })

  it('drops a picked seam that is not in the plan check and generates the rest', async () => {
    const { jobId, scenarioId } = await invoke('generate:scenario', {
      projectPath,
      brief: { ...brief, seamIds: ['0123456789abcdef', deadline.id] },
    })
    expect((await jobs.wait(jobId)).status).toBe('done')
    const s = await getScenario(projectPath, scenarioId)
    expect(s.seams.map((x) => x.id)).toEqual([deadline.id])
  })
})
