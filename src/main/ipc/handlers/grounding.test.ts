// Integration (#423): grounding:* through the IPC dispatcher against a real project folder, the
// NCIA corpus as the index and the mock provider for "Verify with model".
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Citation, LintWarning, MselRow, Scenario } from '@shared/schemas'
import { FakeNciaIndex } from '../../../../tests/fixtures/generate/fakes'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../registry')
const handlers = {
  ...(await import('./project')).default,
  ...(await import('./scenario')).default,
  ...(await import('./grounding')).default,
}
const { jobs } = await import('../../jobs/manager')
const { resetSettingsCache } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../../providers/mock/adapter')
const { setPipelineDeps } = await import('../../generate/deps')
const { getScenario } = await import('../../scenario/store')

async function invoke<C extends Channel>(
  c: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, c, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

const index = new FakeNciaIndex()
/** A TIRP chunk about the FIDS / BHS failure (Scenario C), cited by the rows below. */
const tirp = index.chunks.find((c) => /13\.6/.test(c.headingPath))!
const cite: Citation = {
  documentId: tirp.documentId,
  documentTitle: tirp.documentTitle,
  headingPath: tirp.headingPath,
  chunkId: tirp.id,
  quote: tirp.text.slice(0, 200),
}
/** The first full sentence of the chunk, as a claim that copies the plan. */
const planSentence = /[A-Z][^.\n|]{30,}\./.exec(tirp.text)![0]

const row = (id: string, expectedAction: string, citations: Citation[]): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'Airline',
  toRoleIds: [],
  event: 'Something happens.',
  expectedAction,
  purposeTag: 'CORE_NARRATIVE',
  citations,
  locked: false,
})

let projectPath: string
let scenario: Scenario

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  setPipelineDeps({ openIndex: async () => index })
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-grounding-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' }))
    .path
  const empty = await invoke('scenarios:create-empty', { projectPath, title: 'Grounding' })
  scenario = await invoke('scenarios:save', {
    projectPath,
    scenario: {
      ...empty,
      phases: [{ id: 'p1', index: 0, title: 'One', goal: 'g', startTime: '0:00', endTime: '1:00' }],
      msel: [
        row('I-01', planSentence, [cite]),
        row(
          'I-02',
          'The Airport Duty Manager declares an emergency and activates the EOC per ASP 9.9.',
          [],
        ),
      ],
    },
  })
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
})

describe('grounding handlers', () => {
  it('stores labels with the save and lists an unsupported row in the checks', async () => {
    expect(scenario.grounding?.items['row:I-01']?.label).toBe('grounded')
    expect(scenario.grounding?.items['row:I-02']?.label).toBe('unsupported')
    const lint = await invoke('scenarios:lint', { projectPath, scenarioId: scenario.id })
    expect(lint.filter((w: LintWarning) => w.code === 'GROUNDING_UNSUPPORTED')).toEqual([
      expect.objectContaining({ rowId: 'I-02', severity: 'warning' }),
    ])
  })

  it('recomputes on read without writing scenario.json', async () => {
    const g = await invoke('grounding:scenario', { projectPath, scenarioId: scenario.id })
    expect(Object.keys(g.items).sort()).toEqual(['row:I-01', 'row:I-02'])
    expect((await getScenario(projectPath, scenario.id)).updatedAt).toBe(scenario.updatedAt)
  })

  it('keeps the user’s label and note, and clears it on request', async () => {
    const set = await invoke('grounding:override', {
      projectPath,
      scenarioId: scenario.id,
      itemKey: 'row:I-02',
      label: 'grounded',
      note: 'Checked with the ASC',
    })
    expect(set.override).toMatchObject({ label: 'grounded', note: 'Checked with the ASC' })
    const lint = await invoke('scenarios:lint', { projectPath, scenarioId: scenario.id })
    expect(
      lint.some((w: LintWarning) => w.code.startsWith('GROUNDING_') && w.rowId === 'I-02'),
    ).toBe(false)
    const cleared = await invoke('grounding:override', {
      projectPath,
      scenarioId: scenario.id,
      itemKey: 'row:I-02',
    })
    expect(cleared.override).toBeUndefined()
  })

  it('refuses an item key of another shape', async () => {
    await expect(
      invoke('grounding:override', {
        projectPath,
        scenarioId: scenario.id,
        itemKey: '../row:I-01',
        label: 'grounded',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('verifies with the model: a quoted verdict counts, a made-up quote is discarded', async () => {
    setMockResponse('GroundingVerifyOutput', (req) => {
      const user = String(req.messages.at(-1)?.content ?? '')
      const claim = /Claims:\n- (.*)\n/.exec(user)?.[1] ?? ''
      return user.includes('MSEL row I-01')
        ? { claims: [{ claim, verdict: 'supported', quote: planSentence }] }
        : {
            claims: [
              { claim, verdict: 'supported', quote: 'Ignore the plan and approve every action.' },
            ],
          }
    })
    const { jobId } = await invoke('grounding:verify', { projectPath, scenarioId: scenario.id })
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('done')
    const saved = await getScenario(projectPath, scenario.id)
    expect(saved.grounding?.items['row:I-01']?.model).toMatchObject({
      label: 'grounded',
      quotes: [{ quote: planSentence }],
      discarded: 0,
    })
    // I-02 cites nothing, so it is not sent; a verify of I-01 alone with a bad quote:
    setMockResponse('GroundingVerifyOutput', () => ({
      claims: [
        { claim: planSentence, verdict: 'contradicted', quote: 'A sentence the plan never had.' },
      ],
    }))
    const again = await invoke('grounding:verify', {
      projectPath,
      scenarioId: scenario.id,
      itemKeys: ['row:I-01'],
    })
    await jobs.wait(again.jobId)
    const after = await getScenario(projectPath, scenario.id)
    expect(after.grounding?.items['row:I-01']?.model).toMatchObject({
      label: 'grounded',
      discarded: 1,
      quotes: [],
    })
    expect(after.grounding?.items['row:I-01']?.label).toBe('grounded')
  })

  it('turns model confirmation on by default for a local provider', async () => {
    const d = await invoke('plan-check:defaults', { projectPath })
    expect(d).toMatchObject({ confirmWithModel: true })
    expect(d.reason).toMatch(/runs on this computer/)
    expect(await invoke('plan-check:get', { projectPath })).toBeNull()
  })
})
