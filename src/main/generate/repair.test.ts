// generate:repair (#185) against the real stores, the shipped prompts, the mock provider and
// the fixture templates: a finished scenario is fixed in place. Only the flagged row is
// rewritten, only its inject and the missing one are written, only stale cards re-render,
// stale warnings go, and every other row and inject file stays byte-identical.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Inject, MselPhaseOutput, Scenario } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import { FakeNciaIndex } from '../../../tests/fixtures/generate/fakes'
import {
  fakeRenderer,
  injectTextResponder,
  makeTestResources,
  mediaBriefResponder,
} from '../../../tests/fixtures/injects/fixtures'
import type { RepairSummary } from './repair'

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
const { createScenario, getScenario, saveInject, saveScenario, updateScenario } =
  await import('../scenario/store')
const { deleteInject } = await import('./injects/store')

const handlers = { ...projectHandlers, ...generateHandlers, ...injectHandlers, ...jobHandlers }
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

let projectPath: string
let scenarioId: string

/** The row the test turns into a player's announcement, and the one that loses its inject. */
const VOICED = 'I-03'
const NO_INJECT = 'I-07'
const REWRITTEN_EVENT =
  'Phone Call: "Gate B4 agent here. The board says Miami, the passengers say Minneapolis, and I board in ten minutes. Which one do I trust?"'

/** Revision pass: the flagged row rewritten; mix pass: nothing usable (a control row id). */
function mselRepairResponder(req: ChatRequest): MselPhaseOutput {
  const user = req.messages.map((m) => m.content).join('\n')
  const row = FIXTURE.msel.find((r) => r.id === VOICED)!
  if (/REVISION PASS/.test(user) && user.includes(`${VOICED}:`))
    return {
      rows: [
        {
          id: VOICED,
          time: row.time,
          from: 'Gate Agent',
          to: ['ops-director'],
          event: REWRITTEN_EVENT,
          expectedAction: 'Ops confirms the destination from the airline system before boarding.',
          purposeTag: row.purposeTag,
          format: 'phone_call',
          citations: [],
        },
      ],
    }
  return {
    rows: [
      {
        id: 'START',
        time: '0:00',
        from: 'Facilitator',
        to: ['all'],
        event: 'STARTEX',
        expectedAction: '',
        purposeTag: 'STARTEX',
        format: 'startex_card',
        citations: [],
      },
    ],
  }
}

function hashTree(dir: string, base = dir, out = new Map<string, string>()) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) hashTree(full, base, out)
    else
      out.set(relative(base, full), createHash('sha256').update(readFileSync(full)).digest('hex'))
  }
  return out
}

const scenarioDir = () => join(projectPath, 'scenarios', scenarioId)

async function wait(jobId: string) {
  const job = await jobs.wait(jobId)
  expect(job.status, job.error).toBe('done')
  return job
}

/** A finished scenario: every inject written and its card rendered. */
async function finishedScenario() {
  await wait((await invoke('generate:injects', { projectPath, scenarioId })).jobId)
  await wait(
    (await invoke('generate:media', { projectPath, scenarioId, paths: ['template'] })).jobId,
  )
}

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-repair-'))
  const created = await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' })
  projectPath = created.path
  const empty = await createScenario(projectPath, { title: 'S3', brief: FIXTURE.brief })
  const s = await saveScenario(
    projectPath,
    { ...FIXTURE, id: empty.id, projectId: created.project.id },
    { by: 'user' },
  )
  scenarioId = s.id
  const index = new FakeNciaIndex()
  setPipelineDeps({ openIndex: async () => index })
  setInjectDeps({ renderer: fakeRenderer, applyPostFx: undefined })
  setMockResponse('InjectTextOutput', injectTextResponder)
  setMockResponse('MediaBriefOutput', mediaBriefResponder)
  setMockResponse('MselPhaseOutput', mselRepairResponder)
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
  setInjectDeps(undefined)
})

describe('generate:repair', () => {
  it('rewrites only the flagged row and touches only what is broken', async () => {
    await finishedScenario()
    const injects = await invoke('injects:list', { projectPath, scenarioId })
    const tweet = injects.find((i) => i.mselRowId === 'I-04')!
    const role = FIXTURE.roles[0]!
    // A player announcing their own decision, a stale phase warning, a stale field warning on
    // an inject whose fields are valid, and a row whose inject was deleted.
    await updateScenario(
      projectPath,
      scenarioId,
      (s) => {
        const row = s.msel.find((r) => r.id === VOICED)!
        row.event = `Phone Call: "This is the ${role.abbreviation}. I am declaring a full ground stop."`
        s.warnings.push(
          {
            code: 'ROW_OUTSIDE_PHASE',
            severity: 'warning',
            message: 'Row I-02 (1:02) is outside the phase',
            source: 'lint',
            rowId: 'I-02',
          },
          {
            code: 'INJECT_FIELDS_INVALID',
            severity: 'warning',
            message: 'I-04: fields still do not match the tweet template after one repair',
            source: 'lint',
            rowId: 'I-04',
            injectId: tweet.id,
          },
        )
      },
      { by: 'user', snapshot: false },
    )
    const gone = injects.find((i) => i.mselRowId === NO_INJECT)!
    await deleteInject(projectPath, scenarioId, gone.id)
    const before = await getScenario(projectPath, scenarioId)
    const hashes = hashTree(scenarioDir())

    const { jobId } = await invoke('generate:repair', { projectPath, scenarioId, aiStills: 0 })
    const job = await wait(jobId)
    const summary = job.result as RepairSummary
    const after = await getScenario(projectPath, scenarioId)

    // Only the voiced row was revised; its text is the revision's.
    expect(summary.msel.revised).toEqual([VOICED])
    expect(summary.msel.textChanged).toEqual([VOICED])
    expect(after.msel.find((r) => r.id === VOICED)!.event).toBe(REWRITTEN_EVENT)
    // The fixture has no DECISION_POINT: after a revision the decision row is re-tagged (its
    // text, and so its inject, stays); every other row is exactly as it was.
    const retagged = after.warnings
      .filter((w) => w.code === 'DECISION_POINT_RETAGGED')
      .map((w) => w.rowId)
    expect(retagged).toHaveLength(1)
    const same = (id: string) => ![VOICED, NO_INJECT, ...retagged].includes(id)
    for (const row of after.msel.filter((r) => same(r.id)))
      expect(row, row.id).toEqual(before.msel.find((r) => r.id === row.id))
    // Injects for the rewritten row and the row without one; the stale tweet card re-rendered.
    expect(summary.injectRows).toEqual([VOICED, NO_INJECT])
    expect(summary.recheck.cleared).toContain(tweet.id)
    expect(summary.mediaInjects).toContain(tweet.id)
    // Stale warnings are gone; the voiced row is no longer flagged.
    const codes = after.warnings.map((w) => `${w.code}:${w.rowId ?? ''}`)
    expect(codes).not.toContain('ROW_OUTSIDE_PHASE:I-02')
    expect(codes).not.toContain(`INJECT_PLAYER_VOICE:${VOICED}`)
    expect(
      after.warnings.some((w) => w.code === 'INJECT_FIELDS_INVALID' && w.injectId === tweet.id),
    ).toBe(false)
    // Every other inject file and its media are byte-identical.
    const touched = new Set(
      (await invoke('injects:list', { projectPath, scenarioId }))
        .filter((i) => [VOICED, NO_INJECT].includes(i.mselRowId) || i.id === tweet.id)
        .map((i) => i.id),
    )
    const now = hashTree(scenarioDir())
    const untouched = [...hashes].filter(
      ([rel]) => /^(injects|media)\//.test(rel) && ![...touched].some((id) => rel.includes(id)),
    )
    expect(untouched.length).toBeGreaterThan(20)
    for (const [rel, h] of untouched) expect(now.get(rel), rel).toBe(h)
  })

  it('leaves a clean scenario alone apart from the recomputed warnings', async () => {
    await finishedScenario()
    const before = await getScenario(projectPath, scenarioId)
    const hashes = hashTree(scenarioDir())
    const { jobId } = await invoke('generate:repair', { projectPath, scenarioId, aiStills: 0 })
    const summary = (await wait(jobId)).result as RepairSummary
    expect(summary.msel.textChanged).toEqual([])
    expect(summary.injectRows).toEqual([])
    expect(summary.mediaInjects).toEqual([])
    const after = await getScenario(projectPath, scenarioId)
    expect(after.msel).toEqual(before.msel)
    const now = hashTree(scenarioDir())
    for (const [rel, h] of hashes)
      if (/^(injects|media)\//.test(rel)) expect(now.get(rel), rel).toBe(h)
  })

  it('the relint drops field warnings of injects fixed by hand and marks their review notes stale (#342)', async () => {
    await finishedScenario()
    const injects = await invoke('injects:list', { projectPath, scenarioId })
    const fixed = injects.find((i) => i.mselRowId === 'I-04')!
    const untouched = injects.find((i) => i.mselRowId === 'I-06')!
    const reviewedAt = new Date(Date.now() - 60_000).toISOString()
    // The hand fix is recorded first (no warnings yet to settle), then the warnings arrive as
    // if from older runs: a relint is what has to clear and mark them.
    await saveInject(
      projectPath,
      scenarioId,
      { ...fixed, title: 'Corrected by hand' },
      { by: 'user' },
    )
    const repaired = (inject: Inject) => ({
      code: 'INJECT_FIELDS_REPAIRED',
      severity: 'warning' as const,
      message: `${inject.mselRowId}: fields/text repaired to fit the template`,
      source: 'lint' as const,
      rowId: inject.mselRowId,
      injectId: inject.id,
    })
    const note = (rowId: string) => ({
      code: 'CRITIQUE',
      severity: 'warning' as const,
      message: `${rowId}: quotes old text`,
      source: 'critique' as const,
      rowId,
    })
    await updateScenario(
      projectPath,
      scenarioId,
      (s) => {
        s.provenance.push({
          stage: 'critique',
          startedAt: reviewedAt,
          finishedAt: reviewedAt,
          status: 'ok',
          repairAttempts: 0,
        })
        s.warnings.push(repaired(fixed), repaired(untouched), note('I-04'), note('I-06'))
      },
      { by: 'ai', snapshot: false },
    )
    await wait((await invoke('generate:repair', { projectPath, scenarioId, aiStills: 0 })).jobId)
    const after = await getScenario(projectPath, scenarioId)
    const left = after.warnings.filter((w) => w.code === 'INJECT_FIELDS_REPAIRED')
    expect(left.map((w) => w.injectId)).toEqual([untouched.id])
    const notes = after.warnings.filter((w) => w.code === 'CRITIQUE')
    expect(notes.map((w) => [w.rowId, !!w.stale])).toEqual([
      ['I-04', true],
      ['I-06', false],
    ])
  })

  it('refuses while another generation job owns the scenario', async () => {
    const { jobId } = await invoke('generate:injects', { projectPath, scenarioId })
    await expect(invoke('generate:repair', { projectPath, scenarioId })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await jobs.wait(jobId)
  })
})
