// Pipeline engine against the real project/scenario stores, the real prompt library (shipped
// prompts/*.md) and the real provider routing (TTX_MOCK_PROVIDERS=1 → mock adapter), with an
// in-memory keyword index over reference/ncia. Only the index is faked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { ConductDetails } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import { MOCK_FIXTURES } from '../providers/mock/fixtures'
import { FakeNciaIndex, ScriptedProvider } from '../../../tests/fixtures/generate/fakes'
import { RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'

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
const { CITATION_DROPPED, planSteps, runFor } = await import('./engine')

const handlers = { ...projectHandlers, ...generateHandlers, ...jobHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

let projectPath: string
let index: FakeNciaIndex

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-gen-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' }))
    .path
  index = new FakeNciaIndex()
  setPipelineDeps({ openIndex: async () => index })
  setMockResponse('MselPhaseOutput', mselResponder)
  setMockResponse('RubricOutput', () => RUBRIC)
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

describe('scenario pipeline (mock provider, shipped prompts)', () => {
  it('runs every stage, maps outputs, writes the documents and lints', async () => {
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(s.status).toBe('ready')
    expect(s.title).toBe('Flight to Nowhere')
    expect(s.overview?.coreSectionsTested[0]?.headingPath).toMatch(/›/)
    expect(s.roles.map((r) => r.id)).toEqual(['ops', 'it', 'pio', 'asc'])
    expect(s.phases).toHaveLength(4)
    expect(s.phases.map((p) => p.startTime)).toEqual(['0:00', '1:00', '2:00', '3:00'])
    expect(s.msel.length).toBeGreaterThanOrEqual(20)
    expect(s.msel[0]).toMatchObject({ id: 'START', purposeTag: 'STARTEX', wallClock: '09:00' })
    expect(s.msel.at(-1)).toMatchObject({ id: 'END', purposeTag: 'ENDEX', wallClock: '12:45' })
    const i03 = s.msel.find((r) => r.id === 'I-03')!
    expect(i03.toRoleIds).toEqual(['ops', 'asc'])
    expect(i03.toLabel).toBe('Ops, ASC')
    expect(s.msel.find((r) => r.id === 'START')?.toRoleIds).toEqual(['ops', 'it', 'pio', 'asc'])
    const cited = s.msel.find((r) => r.id === 'I-01')!
    expect(cited.citations[0]).toMatchObject({
      documentId: expect.any(String),
      chunkId: expect.any(Number),
    })
    expect(index.chunk(cited.citations[0]!.chunkId!)).toBeDefined()
    // The I-04 fixture cites C99, which no prompt showed: dropped and reported.
    expect(s.msel.find((r) => r.id === 'I-04')?.citations).toEqual([])
    expect(s.warnings.some((w) => w.code === CITATION_DROPPED && w.rowId === 'I-04')).toBe(true)
    expect(s.rubric?.metrics.map((m) => m.points)).toEqual([30, 30, 20, 20])
    expect(s.hotwash?.questions.length).toBeGreaterThan(0)
    expect(s.simcellScripts.length).toBeGreaterThan(0)
    // The eeg stage (#421) mapped objectives to capabilities and wrote cited EEGs whose tasks
    // link existing rows; unknown rows (I-12c is not in phase 3 here) were dropped.
    expect(s.evaluation.objectiveCapabilities.map((p) => p.capability)).toEqual([
      'public_information_and_warning',
      'operational_coordination',
      'infrastructure_systems',
      'cybersecurity',
    ])
    expect(s.evaluation.objectiveCapabilities[0]?.objectiveId).toBe(s.objectives[0]?.id)
    expect(s.evaluation.eegs).toHaveLength(4)
    const tasks = s.evaluation.eegs.flatMap((e) => e.criticalTasks)
    expect(tasks.map((t) => t.id)).toEqual(
      tasks.map((_, i) => `T-${String(i + 1).padStart(2, '0')}`),
    )
    for (const t of tasks) {
      expect(t.citation.chunkId, t.task).toEqual(expect.any(Number))
      for (const id of t.rowIds)
        expect(
          s.msel.some((r) => r.id === id),
          id,
        ).toBe(true)
    }
    expect(tasks.find((t) => t.task.startsWith('Decide whether'))).toMatchObject({
      expectedBy: 'ops',
      rowIds: ['I-09'],
      objectiveRefs: [s.objectives[1]?.id],
    })
    // SitMan modules (#420): one per phase, role keys resolved, citations from the shown keys.
    expect(s.sitman?.modules.map((m) => m.phaseId)).toEqual(s.phases.map((p) => p.id))
    expect(s.sitman?.modules[0]?.discussionQuestions[0]?.roleIds).toEqual(['ops'])
    expect(s.sitman?.modules[0]?.discussionQuestions[0]?.citations[0]?.chunkId).toBeDefined()
    expect(s.sitman?.assumptions.length).toBeGreaterThanOrEqual(3)
    // Every step has an ok run with provenance.
    const steps = planSteps(s)
    expect(steps).toHaveLength(13)
    for (const step of steps) {
      const run = runFor(s, step)
      expect(run?.status, step.stage).toBe('ok')
      expect(run?.promptHash).toMatch(/^[0-9a-f]{64}$/)
      expect(run?.providerRef?.providerId).toBe('mock')
    }
    // Documents on disk, with the handbook assembled across stages.
    for (const kind of ['overview', 'handbook', 'briefing', 'hotwash'] as const) {
      expect(s.documents[kind], kind).toMatch(
        new RegExp(`^scenarios/${s.id}/documents/${kind}.md$`),
      )
      expect(existsSync(join(projectPath, s.documents[kind]!))).toBe(true)
    }
    const handbook = readFileSync(join(projectPath, s.documents.handbook!), 'utf8')
    expect(handbook).toContain('### 4. Evaluation & Grading Rubric')
    expect(handbook).toContain('**Metric 1: Operational Coordination (30 Points)**')
    expect(handbook).toContain('### 5. Hot Wash Guide')
    expect(handbook).toContain('FBI Cyber Task Force')
    const msel = readFileSync(join(projectPath, s.documents.overview!), 'utf8')
    expect(msel).toContain('## Phase 1: The Glitch (Hour 0:00 – 1:00)')
    expect(msel).toContain('| 0:15 (09:15) | I-01 |')
    const briefing = readFileSync(join(projectPath, s.documents.briefing!), 'utf8')
    expect(briefing).toContain('### 4. Incident Briefing Form (ICS-201)')
    expect(briefing).toContain('| FIDS Screens | | |')
    // Lints ran on a conforming MSEL: nothing beyond the dropped citation, density notes and
    // the rows the EEG fixture's tasks do not cover (info).
    const codes = new Set(s.warnings.map((w) => w.code))
    expect(
      [...codes].filter(
        (c) =>
          ![
            'CITATION_DROPPED',
            'DENSITY_LOW',
            'DENSITY_HIGH',
            'DENSITY_DENSE',
            'EEG_ROW_UNCOVERED',
          ].includes(c),
      ),
    ).toEqual([])
    // Tokens streamed per stage and item.
    const { tokens } = jobs.logOf(job.id)
    expect(Object.keys(tokens).filter((k) => k.startsWith('msel_phase:'))).toHaveLength(4)
    expect(tokens.scenario_overview).toContain('Flight to Nowhere')
  })

  it('generate:ideas stores grounded ideas that ideas-result returns', async () => {
    const { jobId } = await invoke('generate:ideas', { projectPath, brief: {}, count: 2 })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    const ideas = await invoke('generate:ideas-result', { projectPath })
    expect(ideas).toHaveLength(2)
    expect(ideas[0]?.sectionsExercised[0]?.headingPath).toMatch(/›/)
    expect(index.queries.some((q) => /hazard appendix/i.test(q))).toBe(true)
    // A chosen idea reaches the overview prompt.
    const seen: string[] = []
    setMockResponse('OverviewOutput', (req: ChatRequest) => {
      seen.push(req.messages[0]!.content)
      return {
        title: ideas[1]!.title,
        subtitle: 'x',
        theme: 't',
        threat: 'th',
        operationalImpact: 'o',
        coreSectionsTested: [{ citation: 'C1', why: 'w' }],
        targetAudience: 'a',
        location: 'l',
      }
    })
    const { scenarioId, jobId: j2 } = await invoke('generate:scenario', {
      projectPath,
      brief,
      idea: ideas[1],
    })
    await jobs.wait(j2)
    expect(seen[0]).toContain(`Title: ${ideas[1]!.title}`)
    expect((await getScenario(projectPath, scenarioId)).brief.ideaId).toBe(ideas[1]!.id)
  })

  it('asks once more for the rows a phase lacks and merges them (mix completion pass)', async () => {
    const calls: { phase: number; mixPass: boolean; gaps: string }[] = []
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      const user = req.messages[0]!.content
      const phase = Number(
        /(?:NOW WRITE PHASE|MIX COMPLETION PASS for phase) (\d+)/.exec(user)?.[1] ?? 0,
      )
      const mixPass = user.includes('MIX COMPLETION PASS')
      calls.push({
        phase,
        mixPass,
        gaps: user.split('what is missing:')[1]?.split('Ids continue')[0]?.trim() ?? '',
      })
      const full = mselResponder(req)
      if (phase !== 3) return full
      if (!mixPass)
        return {
          rows: full.rows.filter((r) => r.purposeTag !== 'NOISE' && r.purposeTag !== 'CLUE'),
        }
      return {
        rows: [
          {
            id: 'I-12b',
            time: '2:50',
            from: 'Helpdesk',
            to: ['it'],
            event: 'Ticket #4510: badge printer jammed again.',
            expectedAction: 'IT deprioritizes.',
            purposeTag: 'NOISE',
            format: 'helpdesk_ticket',
            citations: ['C1'],
          },
          {
            id: 'I-12c',
            time: '2:55',
            from: 'SIEM',
            to: ['it'],
            event: 'SIEM Alert: outbound beacon from OPS_INTERN_03.',
            expectedAction: 'IT blocks it.',
            purposeTag: 'CLUE',
            format: 'siem_alert',
            citations: [],
          },
          {
            id: 'I-09',
            time: '2:00',
            from: 'IT Lead',
            to: ['it', 'ops'],
            event:
              'Technical Update: unauthorized admin access in AODB SQL; random_gate_generator.ps1 running.',
            expectedAction: 'dup',
            purposeTag: 'DECISION_POINT',
            format: 'system_log',
            citations: [],
          },
        ],
      }
    })
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(calls.filter((c) => c.mixPass)).toHaveLength(1)
    const fix = calls.find((c) => c.mixPass)!
    expect(fix.phase).toBe(3)
    expect(fix.gaps).toMatch(/NOISE/)
    expect(fix.gaps).toMatch(/CLUE/)
    const p3 = s.phases[2]!.id
    const ids = s.msel.filter((r) => r.phaseId === p3).map((r) => r.id)
    expect(ids).toContain('I-12b')
    expect(ids).toContain('I-12c')
    expect(ids.filter((id) => id === 'I-09')).toHaveLength(1)
    expect(s.msel.find((r) => r.id === 'I-12b')?.citations).toHaveLength(1)
    expect(s.warnings.filter((w) => w.code.startsWith('MIX_'))).toEqual([])
    const run = runFor(s, { stage: 'msel_phase', itemId: p3 })!
    expect(run.inputTokens).toBeGreaterThan(
      runFor(s, { stage: 'msel_phase', itemId: s.phases[0]!.id })!.inputTokens!,
    )
  })

  it('resets invented geography and strips citation keys from prose', async () => {
    setMockResponse('OverviewOutput', () => ({
      title: 'Lights Out',
      subtitle: 'ALCS',
      theme: 'Trust',
      threat: 'Ransomware on the ALCS server (C1) per the AEP [C2].',
      operationalImpact: 'Dark runway.',
      coreSectionsTested: [{ citation: 'C1', why: 'w' }],
      targetAudience: 'Ops',
      location: 'North Coast Regional Airport, NCRA, CA',
    }))
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(s.overview?.threat).toBe('Ransomware on the ALCS server per the AEP.')
    expect(s.overview?.location).toBe('NCIA')
    expect(s.overview?.coreSectionsTested).toHaveLength(1)
    const w = s.warnings.find((x) => x.code === 'LOCATION_UNGROUNDED')
    expect(w?.message).toMatch(/california/)
  })

  it('rewrites only the rows flagged by error-severity critique issues (revision pass)', async () => {
    const revisions: string[] = []
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      const user = req.messages[0]!.content
      if (!user.includes('REVISION PASS')) return mselResponder(req)
      revisions.push(user)
      return {
        rows: [
          {
            id: 'I-07',
            time: '1:30',
            from: 'BHS Control Room (Duty Manager)',
            to: ['ops'],
            event: 'Memo: sortation controller corrupted; all Concourse A bags to Manual Encode.',
            expectedAction: 'Ops authorizes manual baggage handling.',
            purposeTag: 'CORE_NARRATIVE',
            format: 'memo',
            citations: ['C1'],
          },
          {
            id: 'I-99',
            time: '1:35',
            from: 'Nobody',
            to: ['ops'],
            event: 'Unrequested row.',
            expectedAction: 'x',
            purposeTag: 'NOISE',
            format: 'memo',
            citations: [],
          },
        ],
      }
    })
    setMockResponse('CritiqueOutput', () => ({
      issues: [
        {
          severity: 'error',
          rowId: 'I-07',
          message: 'BHS call contradicts I-06.',
          suggestion: 'Move it after the PA inject.',
        },
        { severity: 'warning', rowId: 'I-12', message: 'Vague.', suggestion: 'Name the station.' },
        { severity: 'error', message: 'No row id here.', suggestion: 'n/a' },
      ],
      summary: 'Fix I-07.',
    }))
    const { job, scenario: s } = await generate()
    expect(job.status, job.error).toBe('done')
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toContain('phase 2')
    expect(revisions[0]).toContain(
      'I-07: BHS call contradicts I-06. Fix: Move it after the PA inject.',
    )
    const critique = s.warnings.filter((w) => w.source === 'critique')
    expect(critique.find((w) => w.rowId === 'I-07')?.message).toMatch(/rewritten once/)
    expect(critique.find((w) => w.rowId === 'I-12')?.message).not.toMatch(/rewritten/)
    const phase2 = s.msel.filter((r) => r.phaseId === s.phases[1]!.id)
    const i07 = phase2.find((r) => r.id === 'I-07')!
    expect(i07.event).toMatch(/^Memo: sortation controller corrupted/)
    expect(i07.from).toBe('BHS Control Room (Duty Manager)')
    expect(i07.time).toBe('1:30')
    expect(i07.citations).toHaveLength(1)
    expect(phase2.map((r) => r.id)).not.toContain('I-99')
    expect(phase2.find((r) => r.id === 'I-06')?.purposeTag).toBe('DECISION_POINT')
    expect(s.warnings.filter((w) => w.code === 'RUBRIC_LINK_UNKNOWN')).toEqual([])
    expect(s.status).toBe('ready')
  })

  it('re-running a stage with instructions marks downstream stale; continue re-runs only those', async () => {
    const { scenario: s } = await generate()
    const prompts: string[] = []
    setMockResponse('PhasePlanOutput', (req: ChatRequest) => {
      prompts.push(req.messages[0]!.content)
      return {
        phases: [
          { title: 'Early', goal: 'g1', startTime: '0:00', endTime: '2:00', beats: ['a'] },
          { title: 'Late', goal: 'g2', startTime: '2:00', endTime: '4:00', beats: ['b'] },
        ],
      }
    })
    const { jobId } = await invoke('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'phase_plan',
      instructions: 'Use two phases only.',
    })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    expect(prompts[0]).toContain('Use two phases only.')
    const after = await getScenario(projectPath, s.id)
    expect(after.status).toBe('draft')
    expect(after.phases.map((p) => p.title)).toEqual(['Early', 'Late'])
    expect(after.phases[0]?.id).toBe(s.phases[0]?.id)
    // Beats are a field of their own (#87); the goal stays clean.
    expect(after.phases[0]?.goal).toBe('g1')
    expect(after.phases[0]?.beats).toEqual(['a'])
    expect(runFor(after, { stage: 'phase_plan' })?.status).toBe('ok')
    expect(runFor(after, { stage: 'scenario_overview' })?.status).toBe('ok')
    for (const stage of [
      'controller_handbook',
      'rubric',
      'eeg',
      'player_briefing',
      'hotwash',
      'sitman',
      'critique',
    ] as const) {
      expect(runFor(after, { stage })?.status, stage).toBe('stale')
    }
    expect(runFor(after, { stage: 'msel_phase', itemId: s.phases[0]!.id })?.status).toBe('stale')
    // Rows of phases that no longer exist were dropped; kept rows still attach to live phases.
    expect(after.msel.every((r) => after.phases.some((p) => p.id === r.phaseId))).toBe(true)

    const overviewCalls: number[] = []
    setMockResponse('OverviewOutput', () => {
      overviewCalls.push(1)
      return {
        title: 'never',
        subtitle: '',
        theme: '',
        threat: '',
        operationalImpact: '',
        coreSectionsTested: [{ citation: 'C1', why: '' }],
        targetAudience: '',
        location: '',
      }
    })
    const cont = await invoke('generate:continue', { projectPath, scenarioId: s.id })
    const job2 = await jobs.wait(cont.jobId)
    expect(job2.status, job2.error).toBe('done')
    const done = await getScenario(projectPath, s.id)
    expect(overviewCalls).toEqual([])
    expect(done.title).toBe('Flight to Nowhere')
    expect(done.status).toBe('ready')
    expect(planSteps(done)).toHaveLength(11)
    expect(done.provenance.every((r) => r.status === 'ok' || r.stage === 'msel_phase')).toBe(true)
    expect(planSteps(done).every((st) => runFor(done, st)?.status === 'ok')).toBe(true)
  })

  it('re-running the eeg stage keeps a ready scenario ready, marks nothing stale and keeps locked tasks', async () => {
    const { scenario: s } = await generate()
    // The designer locks one task and sets its timing by hand; the re-run must keep it as is.
    const locked = structuredClone(s)
    const task = locked.evaluation.eegs[1]!.criticalTasks[0]!
    task.locked = true
    task.timing = 'within 15 minutes (set by hand)'
    const store = await import('../scenario/store')
    await store.saveScenario(projectPath, locked, { by: 'user' })
    const { jobId } = await invoke('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'eeg',
      instructions: 'Fewer tasks.',
    })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    const after = await getScenario(projectPath, s.id)
    expect(after.status).toBe('ready')
    for (const stage of ['player_briefing', 'hotwash', 'critique'] as const)
      expect(runFor(after, { stage })?.status, stage).toBe('ok')
    const kept = after.evaluation.eegs.flatMap((e) => e.criticalTasks).find((t) => t.id === task.id)
    expect(kept).toMatchObject({ locked: true, timing: task.timing })
    // The fresh task with the same capability and text was replaced by the locked one, not doubled.
    expect(
      after.evaluation.eegs[1]!.criticalTasks.filter((t) =>
        /Operational Incident Command/.test(t.task),
      ),
    ).toHaveLength(1)
  })

  it('the eeg stage fails with a clear message when nothing is retrieved, without calling the model', async () => {
    const calls: string[] = []
    setMockResponse('EegOutput', () => {
      calls.push('eeg')
      return {}
    })
    const { scenario: s } = await generate()
    calls.length = 0
    index.search = async () => []
    const { jobId } = await invoke('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'eeg',
    })
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/no plan sections found for the objectives/)
    expect(calls).toEqual([])
  })

  it('rejects stages the scenario pipeline does not own', async () => {
    const { scenario: s } = await generate()
    await expect(
      invoke('generate:rerun-stage', {
        projectPath,
        scenarioId: s.id,
        stage: 'inject_text',
        itemId: 'x',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      invoke('generate:rerun-stage', { projectPath, scenarioId: s.id, stage: 'msel_phase' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('the sitman stage never sends the exercise details to the provider (#420)', async () => {
    const { scenario: s } = await generate()
    const { saveScenario } = await import('../scenario/store')
    const conduct = ConductDetails.parse({
      sponsor: 'Sponsor Org Q',
      director: { name: 'Dana Whitfield', phone: '555-0142', email: 'dw@ncia.example' },
    })
    await saveScenario(projectPath, { ...s, conduct }, { by: 'user' })
    const prompts: string[] = []
    setMockResponse('SitManOutput', (req: ChatRequest) => {
      prompts.push(req.messages.map((m) => m.content).join('\n'))
      return MOCK_FIXTURES.SitManOutput
    })
    const { jobId } = await invoke('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'sitman',
    })
    expect((await jobs.wait(jobId)).status).toBe('done')
    expect(prompts).toHaveLength(1)
    for (const secret of ['Dana Whitfield', '555-0142', 'dw@ncia.example', 'Sponsor Org Q'])
      expect(prompts[0]).not.toContain(secret)
    const after = await getScenario(projectPath, s.id)
    expect(after.conduct?.director.name).toBe('Dana Whitfield')
    expect(runFor(after, { stage: 'critique' })?.status).toBe('stale')
  })
})

describe('scenario pipeline (scripted provider)', () => {
  const valid = (name: string, value: unknown) =>
    JSON.stringify(name === 'OverviewOutput' ? value : value)

  it('repairs an invalid stage output once, then fails the stage with a clear error', async () => {
    let calls = 0
    const provider = new ScriptedProvider((req) => {
      calls++
      if (req.json?.name !== 'OverviewOutput') return '{}'
      return calls === 1
        ? '{"title": "Half", "theme": "no other fields"}'
        : valid('OverviewOutput', {
            title: 'Repaired',
            subtitle: 's',
            theme: 't',
            threat: 'th',
            operationalImpact: 'o',
            coreSectionsTested: [{ citation: 'C1', why: 'w' }],
            targetAudience: 'a',
            location: 'l',
          })
    })
    setPipelineDeps({
      openIndex: async () => index,
      resolveTextProvider: async () => ({ provider, model: 'scripted', providerId: 'scripted' }),
    })
    const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(
      /Stage objectives_roles failed: Output did not match ObjectivesRolesOutput after 1 repair attempt/,
    )
    const s = await getScenario(projectPath, scenarioId)
    expect(s.title).toBe('Repaired')
    const overview = runFor(s, { stage: 'scenario_overview' })
    expect(overview).toMatchObject({ status: 'ok', repairAttempts: 1 })
    expect(overview?.inputTokens).toBe(200)
    // The repair turn carried the bad output and the validation errors back.
    const repair = provider.requests[1]!
    expect(repair.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(repair.messages[2]!.content).toMatch(/did not match the required JSON schema/)
    expect(repair.messages[2]!.content).toMatch(/threat/)
    expect(runFor(s, { stage: 'objectives_roles' })).toMatchObject({
      status: 'error',
      repairAttempts: 1,
    })
    expect(s.status).toBe('draft')

    // continue resumes at the failed stage; the ok stage is not called again.
    setPipelineDeps({ openIndex: async () => index })
    const cont = await invoke('generate:continue', { projectPath, scenarioId })
    const job2 = await jobs.wait(cont.jobId)
    expect(job2.status, job2.error).toBe('done')
    const done = await getScenario(projectPath, scenarioId)
    expect(done.title).toBe('Repaired')
    expect(done.status).toBe('ready')
    expect(provider.requests).toHaveLength(4)
  })

  it('cancels inside a call, records the step as failed and can continue later', async () => {
    let release: (() => void) | undefined
    const provider = new ScriptedProvider(async (req) => {
      if (req.json?.name === 'ObjectivesRolesOutput') {
        await new Promise<void>((r) => (release = r))
        req.signal?.throwIfAborted()
      }
      return JSON.stringify({
        title: 'T',
        subtitle: 's',
        theme: 't',
        threat: 'th',
        operationalImpact: 'o',
        coreSectionsTested: [{ citation: 'C1', why: 'w' }],
        targetAudience: 'a',
        location: 'l',
      })
    })
    setPipelineDeps({
      openIndex: async () => index,
      resolveTextProvider: async () => ({ provider, model: 'scripted', providerId: 'scripted' }),
    })
    const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
    await vi.waitFor(() => expect(release).toBeDefined())
    await invoke('jobs:cancel', { jobId })
    release!()
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('cancelled')
    const s = await getScenario(projectPath, scenarioId)
    expect(runFor(s, { stage: 'scenario_overview' })?.status).toBe('ok')
    expect(runFor(s, { stage: 'objectives_roles' })).toMatchObject({
      status: 'error',
      error: 'Cancelled',
    })
    expect(runFor(s, { stage: 'phase_plan' })).toBeUndefined()

    setPipelineDeps({ openIndex: async () => index })
    const cont = await invoke('generate:continue', { projectPath, scenarioId })
    const job2 = await jobs.wait(cont.jobId)
    expect(job2.status, job2.error).toBe('done')
    expect((await getScenario(projectPath, scenarioId)).title).toBe('T')
  })

  it('cancels between calls: the finished step is kept and the next one never starts', async () => {
    const store = await import('../scenario/store')
    const provider = new ScriptedProvider(() =>
      JSON.stringify({
        title: 'Between',
        subtitle: 's',
        theme: 't',
        threat: 'th',
        operationalImpact: 'o',
        coreSectionsTested: [{ citation: 'C1', why: 'w' }],
        targetAudience: 'a',
        location: 'l',
      }),
    )
    let resolveJobId: (id: string) => void = () => undefined
    const jobIdKnown = new Promise<string>((r) => (resolveJobId = r))
    setPipelineDeps({
      openIndex: async () => index,
      resolveTextProvider: async () => ({ provider, model: 'scripted', providerId: 'scripted' }),
      store: {
        ...store,
        saveScenario: async (root, scenario, opts) => {
          const saved = await store.saveScenario(root, scenario, opts)
          // The overview checkpoint is written; cancel before the next step begins.
          if (opts.note === 'scenario_overview ok') jobs.cancel(await jobIdKnown)
          return saved
        },
      },
    })
    const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
    resolveJobId(jobId)
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('cancelled')
    const s = await getScenario(projectPath, scenarioId)
    expect(s.title).toBe('Between')
    expect(runFor(s, { stage: 'scenario_overview' })?.status).toBe('ok')
    expect(runFor(s, { stage: 'objectives_roles' })).toBeUndefined()
    expect(provider.requests).toHaveLength(1)
  })
})
