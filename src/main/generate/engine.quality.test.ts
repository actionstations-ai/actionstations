// Generation-quality regressions (#84 facility facts, #85 critique source claims and the
// revision pass, #86 rubric links after a revision, #87 phase beats) against the real stores,
// the shipped prompts and the mock provider, with the NCIA facility facts injected.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { MselPhaseOutput, Scenario } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import { FakeNciaIndex } from '../../../tests/fixtures/generate/fakes'
import { MSEL_PHASES, RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'

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
const { clearMockResponses, setMockResponse } = await import('../providers/mock/adapter')
const { setPipelineDeps } = await import('./deps')
const { getScenario } = await import('../scenario/store')
const { extractFacilityFacts, FACILITY_UNKNOWN_ID, withEntries } = await import('./facility')

const handlers = { ...projectHandlers, ...generateHandlers, ...jobHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

const NCIA = resolve('reference/ncia')
const NCIA_FACTS = extractFacilityFacts(
  readdirSync(NCIA)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(join(NCIA, f), 'utf8')),
)

let projectPath: string
let index: FakeNciaIndex

/** The fake index plus the facility facts a test wants (setPipelineDeps replaces, not merges). */
const useFacts = (facts: typeof NCIA_FACTS): void =>
  setPipelineDeps({ openIndex: async () => index, loadFacilityFacts: async () => facts })

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-gen-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' }))
    .path
  index = new FakeNciaIndex()
  useFacts(NCIA_FACTS)
  setMockResponse('MselPhaseOutput', mselResponder)
  setMockResponse('RubricOutput', () => RUBRIC)
  setMockResponse('CritiqueOutput', () => ({ issues: [], summary: 'Fine.' }))
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
})

const brief = {
  userPrompt: 'AODB tampering misleads FIDS, BHS and PA',
  audience: ['Airport Operations', 'IT', 'PIO', 'Security'],
  durationHours: 4,
  phaseCount: 4,
  learningObjectives: [],
  constraints: [],
  startWallClock: '09:00',
}

async function generate() {
  const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
  const job = await jobs.wait(jobId)
  return { job, scenario: await getScenario(projectPath, scenarioId) }
}

const userOf = (req: ChatRequest): string => req.messages[0]!.content
const isRevision = (req: ChatRequest): boolean => userOf(req).includes('REVISION PASS')
const phaseRows = (s: Scenario, i: number): Scenario['msel'] =>
  s.msel.filter((r) => r.phaseId === s.phases[i]!.id)

/** Phase 1 as the fixture writes it, with I-01 naming a runway and a gate NCIA does not have. */
function phase1WithInventedIds(): MselPhaseOutput {
  const rows = structuredClone(MSEL_PHASES[0]!.rows)
  const i01 = rows.find((r) => r.id === 'I-01')!
  i01.event = 'Phone Call: "Delta at Gate C12 here, lights on Runway 17 are cycling."'
  return { rows }
}

describe('facility facts (#84)', () => {
  it('shows the facts sheet and the beats to the MSEL stage and flags invented identifiers', async () => {
    const prompts: string[] = []
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      prompts.push(userOf(req))
      if (isRevision(req)) return { rows: [] }
      return /NOW WRITE PHASE 1\b/.test(userOf(req)) ? phase1WithInventedIds() : mselResponder(req)
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(prompts[0]).toContain('FACILITY FACTS')
    expect(prompts[0]).toContain('Runways: 5/23, 1/19')
    expect(prompts[0]).toMatch(/Gates \(the complete list\): A1, A2, .*B10, 1, 2/)
    // #87: the phase's beats come from Phase.beats, listed under the goal.
    expect(prompts[0]).toContain('Beats this phase must deliver')
    expect(prompts[0]).toContain('- wrong destination')
    expect(s.phases[0]!.beats).toEqual(['wrong destination', 'noise ticket'])
    expect(s.phases[0]!.goal).not.toContain('Key beats')
    // The lint names the row and what the documents list instead; the revision pass got it.
    const w = s.warnings.find((x) => x.code === FACILITY_UNKNOWN_ID)
    expect(w).toMatchObject({ rowId: 'I-01', severity: 'warning', source: 'lint' })
    expect(w!.message).toContain('Runway 17 (the documents list 5/23, 1/19')
    expect(w!.message).toContain('Gate C12 (the documents list A1, A2, A3')
    const revision = prompts.find((p) => p.includes('REVISION PASS'))
    expect(revision).toContain('I-01: Row I-01 names Runway 17')
    // The fixture's own Scenario-3 tell ("crowd crush at Gate C4", not framed as fake) is the
    // only other hit: one warning per row, each with its rowId for the grid editor.
    expect(s.warnings.filter((x) => x.code === FACILITY_UNKNOWN_ID).map((x) => x.rowId)).toEqual([
      'I-01',
      'I-11',
    ])
  })

  it('a revision that grounds the row clears its FACILITY_UNKNOWN_ID warning', async () => {
    useFacts(withEntries(NCIA_FACTS, 'gates', []))
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      if (isRevision(req)) {
        const fixed = structuredClone(MSEL_PHASES[0]!.rows.find((r) => r.id === 'I-01')!)
        fixed.event = 'Phone Call: "Delta at Gate B4 here, lights on Runway 23 are cycling."'
        return { rows: [fixed] }
      }
      return /NOW WRITE PHASE 1\b/.test(userOf(req)) ? phase1WithInventedIds() : mselResponder(req)
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(phaseRows(s, 0).find((r) => r.id === 'I-01')?.event).toContain('Runway 23')
    expect(s.warnings.filter((x) => x.code === FACILITY_UNKNOWN_ID)).toEqual([])
  })
})

describe('critique source claims and the revision pass (#85)', () => {
  // The fixture rows name no runway; without gates, no facility issue adds a revision.
  beforeEach(() => useFacts(withEntries(NCIA_FACTS, 'gates', [])))

  it('dismisses "from a player role" claims about rows sourced from the outside world', async () => {
    const revisions: string[] = []
    setMockResponse('CritiqueOutput', () => ({
      issues: [
        {
          severity: 'error',
          rowId: 'I-02a',
          message:
            'Row I-02a presents a helpdesk ticket from IT Director, a player role; forensic evidence must be injected externally.',
          suggestion: 'Re-source it.',
        },
        {
          severity: 'error',
          rowId: 'I-07',
          message: 'BHS call contradicts I-06.',
          suggestion: 'Move it after the PA inject.',
        },
      ],
      summary: 'Two fixes.',
    }))
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      if (!isRevision(req)) return mselResponder(req)
      revisions.push(userOf(req))
      return { rows: [] }
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    // Only phase 2 (I-07) was revised; the I-02a claim (from "Helpdesk") was dismissed.
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toContain('I-07: BHS call contradicts')
    const critique = s.warnings.filter((w) => w.source === 'critique')
    expect(critique.map((w) => w.rowId)).toEqual(['I-07'])
    const log = jobs.logOf(job.id).entries.map((e) => e.message)
    expect(log.some((m) => /dismissed .*row I-02a comes from "Helpdesk"/.test(m))).toBe(true)
  })

  it('asks once more for a specific outside party and otherwise re-sources from the channel', async () => {
    const revisions: string[] = []
    setMockResponse('CritiqueOutput', () => ({
      issues: [
        { severity: 'error', rowId: 'I-07', message: 'Vague.', suggestion: 'Sharpen it.' },
        { severity: 'error', rowId: 'I-08', message: 'Weak.', suggestion: 'Sharpen it.' },
      ],
      summary: 'Fix two rows.',
    }))
    const rewrite = (id: string, from: string, format: string, event: string) => ({
      ...structuredClone(MSEL_PHASES[1]!.rows.find((r) => r.id === id)!),
      from,
      format,
      event,
    })
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      if (!isRevision(req)) return mselResponder(req)
      revisions.push(userOf(req))
      if (userOf(req).includes('Name the specific outside party')) {
        return {
          rows: [
            rewrite('I-07', 'BHS Duty Manager', 'phone_call', 'Phone Call: belts are stopping.'),
            rewrite('I-08', 'Facilitator', 'memo', 'Memo: pilots refuse to push back.'),
          ],
        }
      }
      return {
        rows: [
          rewrite('I-07', 'Facilitator', 'phone_call', 'Phone Call: belts are stopping.'),
          rewrite('I-08', 'Facilitator', 'memo', 'Memo: pilots refuse to push back.'),
        ],
      }
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(revisions).toHaveLength(2)
    expect(revisions[1]).toContain('I-07: "from" is "Facilitator"')
    const rows = phaseRows(s, 1)
    expect(rows.find((r) => r.id === 'I-07')?.from).toBe('BHS Duty Manager')
    // Still generic after the second call: the channel decides (a memo → Staff Email).
    expect(rows.find((r) => r.id === 'I-08')?.from).toBe('Staff Email')
    expect(rows.find((r) => r.id === 'I-05')?.from).toBe('Facilitator') // control rows keep it
  })
})

describe('rubric links after a revision (#86)', () => {
  beforeEach(() => useFacts(withEntries(NCIA_FACTS, 'gates', [])))

  it('relinks or prunes rubric links to a row the revision dropped as a duplicate', async () => {
    setMockResponse('CritiqueOutput', () => ({
      issues: [{ severity: 'error', rowId: 'I-06b', message: 'Thin.', suggestion: 'Rewrite.' }],
      summary: 'One fix.',
    }))
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      if (!isRevision(req)) return mselResponder(req)
      const phase2 = MSEL_PHASES[1]!.rows
      const dup = structuredClone(phase2.find((r) => r.id === 'I-06b')!)
      dup.event = phase2.find((r) => r.id === 'I-07')!.event // same text as a kept row
      return { rows: [dup] }
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(phaseRows(s, 1).map((r) => r.id)).not.toContain('I-06b')
    const metric = s.rubric!.metrics.find((m) => m.name === 'Public Communication')!
    expect(metric.linkedInjectIds).not.toContain('I-06b')
    expect(metric.linkedInjectIds).toContain('I-06')
    expect(s.warnings.filter((w) => w.code === 'RUBRIC_LINK_UNKNOWN')).toEqual([])
    const log = jobs.logOf(job.id).entries.map((e) => e.message)
    expect(log.some((m) => /"Public Communication" linked I-06b.*relinked to I-06/.test(m))).toBe(
      true,
    )
  })
})
