// Integration (#431): redlines and drills through the IPC dispatcher on a real project folder.
// A real DOCX plan is ingested by hand (original, text, meta), an AAR/IP cites its section, the
// mock/scripted provider drafts proposals, the export is opened and read back, and a drill is
// drafted, built, rated, recorded and written to a program.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Chunk, Drill, Redline, Scenario } from '@shared/schemas'

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

const { dispatch } = await import('../registry')
const handlers = (await import('./redlines')).default
const { jobs } = await import('../../jobs/manager')
const { createProject } = await import('../../project/store')
const { createScenario, saveScenario, getScenario, listInjects } =
  await import('../../scenario/store')
const { writeAar } = await import('../../aar/store')
const { documentFiles, saveMeta, sha256File, writeText, mutateMeta } =
  await import('../../ingest/storage')
const { writeFileAtomic } = await import('../../lib/fs')
const { resetSettingsCache } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')
const { setPipelineDeps } = await import('../../generate/deps')
const { ScriptedProvider } = await import('../../../../tests/fixtures/generate/fakes')
const { upsertObservation } = await import('../../evaluation/store')
const { onEmit } = await import('../../lib/events')
const { runSessionEndHooks } = await import('../../live/end-hooks')
const { createProgram } = await import('../../program/store')
const { createAction, getAction } = await import('../../program/actions')
const {
  Aar,
  DocumentMeta,
  ProgramAction,
  Scenario: ScenarioSchema,
  ScenarioBrief,
} = await import('@shared/schemas')
const { samplePlan, PIO_SENTENCE } = await import('../../redline/__fixtures__/make-docx')
const { MOCK_FIXTURES } = await import('../../providers/mock/fixtures')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
const HEADING = 'TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

/** An index holding the plan section; the same words are in the DOCX. */
class PlanIndex {
  private readonly chunkList: (Chunk & { documentTitle: string })[] = [
    ['tirp', `${PIO_SENTENCE}\n\nTable rule: notify the county within 30 minutes.`],
    ['eop', 'Notify the county within 30 minutes.'],
  ].map(([documentId, text], i) => ({
    id: i + 1,
    documentId: documentId!,
    documentTitle: documentId!,
    headingPath: HEADING,
    ord: 0,
    text: text!,
    tokenCount: 20,
  }))
  async search() {
    return []
  }
  chunk(id: number) {
    return this.chunkList.find((c) => c.id === id)
  }
  chunks(documentId: string) {
    return this.chunkList.filter((c) => c.documentId === documentId)
  }
}

async function addPlan(
  root: string,
  id: string,
  filename: string,
  text: string,
  bytes: Uint8Array,
) {
  const files = documentFiles(root, { id, filename })
  await writeFileAtomic(files.original, bytes)
  const meta = DocumentMeta.parse({
    id,
    title: id === 'tirp' ? 'Terminal Incident Response Plan' : `Plan ${id}`,
    filename,
    status: 'ok',
    ingestedAt: '2026-03-02T10:00:00.000Z',
    sha256: await sha256File(files.original),
  })
  await saveMeta(root, meta)
  await writeText(root, meta, text)
  return meta
}

function provider(reply: (n: number) => unknown) {
  return new ScriptedProvider((_req, n) => JSON.stringify(reply(n)))
}

async function setup(p?: InstanceType<typeof ScriptedProvider>) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  setPipelineDeps({
    openIndex: async () => new PlanIndex(),
    ...(p
      ? {
          resolveTextProvider: async () => ({
            provider: p,
            model: 'scripted',
            providerId: 'scripted',
          }),
        }
      : {}),
  })
  const parent = mkdtempSync(join(tmpdir(), 'ttx-redline-'))
  const { path: root } = await createProject({
    parentDir: parent,
    name: 'NCIA',
    orgType: 'airport',
  })
  const created = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  await saveScenario(
    root,
    ScenarioSchema.parse({ ...FIXTURE, id: created.id, projectId: created.projectId }),
    { by: 'user' },
  )
  const plan = await addPlan(
    root,
    'tirp',
    'tirp.docx',
    `${HEADING}\n\n${PIO_SENTENCE}\n`,
    await samplePlan(),
  )
  await upsertObservation(root, created.id, {
    id: 'O-1',
    at: '2026-04-12T10:00:00.000Z',
    rowId: 'I-06',
    taskId: 'T-07',
    rating: 'not_met',
    note: '',
    source: 'facilitate',
  })
  await upsertObservation(root, created.id, {
    id: 'O-2',
    at: '2026-04-12T10:05:00.000Z',
    rowId: 'I-09',
    criterionId: 'T-14',
    rating: 'partial',
    note: '',
    source: 'facilitate',
  })
  await writeAar(
    root,
    created.id,
    Aar.parse({
      createdAt: '2026-04-13T10:00:00.000Z',
      updatedAt: '2026-04-13T10:00:00.000Z',
      capabilities: [
        {
          capability: 'public_information_and_warning',
          areasForImprovement: [
            {
              id: 'F1',
              title: 'PIO waited for approval',
              analysisMd: 'The PIO waited 40 minutes for the Incident Commander.',
              citations: [{ documentId: 'tirp', documentTitle: plan.title, headingPath: HEADING }],
              evidence: ['obs:O-1'],
              recommendation: 'Name an alternate approver.',
              correctiveActions: [
                { id: 'CA1', action: 'Name an alternate approver.', element: 'planning' },
              ],
            },
          ],
        },
      ],
    }),
    { by: 'ai' },
  )
  const call = async <T>(channel: string, req: Record<string, unknown> = {}) =>
    (await dispatch(handlers, channel as never, { projectPath: root, ...req })) as Result<T>
  const ok = async <T>(channel: string, req: Record<string, unknown> = {}) => {
    const r = await call<T>(channel, req)
    if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
    return r.data
  }
  const job = async (channel: string, req: Record<string, unknown>) =>
    jobs.wait((await ok<{ jobId: string }>(channel, req)).jobId)
  return { root, scenarioId: created.id, call, ok, job }
}
afterEach(() => setPipelineDeps(undefined))

type Env = Awaited<ReturnType<typeof setup>>
const good = { proposals: [MOCK_FIXTURES.RedlineOutput as { proposals: unknown[] }][0]!.proposals }

async function generate(env: Env): Promise<Redline[]> {
  const job = await env.job('redlines:generate', { scenarioId: env.scenarioId, findingIds: ['F1'] })
  expect(job.status, job.error).toBe('done')
  return env.ok<Redline[]>('redlines:list', {})
}

describe('redlines:generate', () => {
  it('drafts a proposal anchored to the section text, with its source and criteria', async () => {
    const p = provider(() => good)
    const env = await setup(p)
    const seen: string[] = []
    const off = onEmit((name, payload) => {
      if (name === 'project:changed') seen.push((payload as { what: string }).what)
    })
    const [r] = await generate(env)
    off()
    expect(p.requests).toHaveLength(1)
    expect(p.requests[0]!.messages[0]!.content).toContain(PIO_SENTENCE)
    expect(r).toMatchObject({
      status: 'proposed',
      by: 'ai',
      originalExcerpt: PIO_SENTENCE,
      source: {
        findingId: 'F1',
        aarCorrectiveActionIds: ['CA1'],
        capability: 'public_information_and_warning',
      },
      target: { documentId: 'tirp', sourceKind: 'docx', headingPath: HEADING },
    })
    expect(r!.source.criterionIds).toContain('T-07')
    expect(r!.provenance?.stage).toBe('plan_redline')
    expect(seen).toContain('redlines')
  })

  it('sends a quote that is not in the section back once, then keeps the repaired one', async () => {
    const bad = {
      proposals: [
        {
          originalExcerpt: 'The PIO must obtain consent before any release of information.',
          proposedText: 'The PIO releases information with consent.',
          rationale: 'x',
        },
      ],
    }
    const p = provider((n) => (n === 0 ? bad : good))
    const env = await setup(p)
    const list = await generate(env)
    expect(p.requests).toHaveLength(2)
    expect(p.requests[1]!.messages[0]!.content).toContain('must obtain consent')
    expect(list).toHaveLength(1)
    expect(list[0]!.originalExcerpt).toBe(PIO_SENTENCE)
  })

  it('drops a proposal whose quote is still not in the section, and only that one', async () => {
    const bad = {
      proposals: [
        {
          originalExcerpt: 'Nothing like this is in the plan at all.',
          proposedText: 'x',
          rationale: '',
        },
        ...good.proposals,
      ],
    }
    const env = await setup(provider(() => bad))
    const job = await env.job('redlines:generate', {
      scenarioId: env.scenarioId,
      findingIds: ['F1'],
    })
    expect((job.result as { dropped: number }).dropped).toBe(1)
    expect(await env.ok<Redline[]>('redlines:list', {})).toHaveLength(1)
  })

  it('refuses unsafe ids and unknown findings', async () => {
    const env = await setup(provider(() => good))
    const bad = await env.call('redlines:get', { id: '../x' })
    expect(bad.ok).toBe(false)
    const job = await env.job('redlines:generate', {
      scenarioId: env.scenarioId,
      findingIds: ['nope'],
    })
    expect(job.status).toBe('error')
  })
})

describe('redlines:export', () => {
  async function accepted(env: Env): Promise<Redline> {
    const [r] = await generate(env)
    await env.ok('redlines:set-status', { ids: [r!.id], to: 'accepted' })
    return r!
  }

  it('writes a copy of the Word plan with tracked changes and leaves the original alone', async () => {
    const env = await setup(provider(() => good))
    const r = await accepted(env)
    const original = documentFiles(env.root, { id: 'tirp', filename: 'tirp.docx' }).original
    const before = await sha256File(original)
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-out-'))
    expect(await env.ok('redlines:preview-tracked', { id: r.id })).toEqual({ mode: 'tracked' })

    const job = await env.job('redlines:export', { ids: [r.id], outDir })
    expect(job.status, job.error).toBe('done')
    const result = job.result as { files: string[]; perRedline: { mode: string }[] }
    expect(result.perRedline[0]!.mode).toBe('tracked')
    const file = result.files[0]!
    expect(file.endsWith('Terminal-Incident-Response-Plan-redline.docx')).toBe(true)
    const xml = await (
      await JSZip.loadAsync(readFileSync(file))
    )
      .file('word/document.xml')!
      .async('string')
    expect(xml).toContain('<w:ins ')
    expect(xml).toContain('<w:del ')
    expect(xml).toContain('w:author="Action Stations"')
    expect(await sha256File(original)).toBe(before)

    const after = await env.ok<Redline>('redlines:get', { id: r.id })
    expect(after.status).toBe('exported')
    expect(after.export).toMatchObject({ mode: 'tracked', originalSha256: before })
  })

  it('puts a proposal it cannot mark, and every proposal for a PDF plan, in a change memo', async () => {
    const env = await setup(provider(() => good))
    const r = await accepted(env)
    const make = async (documentId: string, excerpt: string) =>
      env.ok<Redline>('redlines:create', {
        redline: {
          projectId: r.projectId,
          source: {
            scenarioId: env.scenarioId,
            scenarioTitle: 'Flight',
            aarCorrectiveActionIds: ['CA1'],
            correctiveActionIds: [],
            criterionIds: [],
          },
          target: {
            documentId,
            documentTitle: 'x',
            headingPath: HEADING,
            sourceKind: documentId === 'tirp' ? 'docx' : 'pdf',
          },
          originalExcerpt: excerpt,
          proposedText: excerpt.replace('30', '15'),
          rationale: 'Shorter deadline.',
        },
      })
    await addPlan(
      env.root,
      'eop',
      'eop.pdf',
      'Notify the county within 30 minutes.',
      new Uint8Array([37, 80, 68, 70]),
    )
    const inTable = await make('tirp', 'Table rule: notify the county within 30 minutes.')
    const inPdf = await make('eop', 'Notify the county within 30 minutes.')
    await env.ok('redlines:set-status', { ids: [inTable.id, inPdf.id], to: 'accepted' })
    expect(await env.ok('redlines:preview-tracked', { id: inTable.id })).toMatchObject({
      mode: 'memo',
    })

    const outDir = mkdtempSync(join(tmpdir(), 'ttx-out-'))
    const job = await env.job('redlines:export', { ids: [r.id, inTable.id, inPdf.id], outDir })
    expect(job.status, job.error).toBe('done')
    const names = readdirSync(outDir).sort()
    expect(names).toEqual([
      'Plan-eop-change-memo.docx',
      'Terminal-Incident-Response-Plan-change-memo.docx',
      'Terminal-Incident-Response-Plan-redline.docx',
    ])
    const memo = (await mammoth.extractRawText({ path: join(outDir, 'Plan-eop-change-memo.docx') }))
      .value
    expect(memo).toContain('Current text')
    expect(memo).toContain('Notify the county within 30 minutes.')
    expect(memo).toContain('within 15 minutes')
    expect(memo).toContain('not a Word file')
    const tableMemo = (
      await mammoth.extractRawText({
        path: join(outDir, 'Terminal-Incident-Response-Plan-change-memo.docx'),
      })
    ).value
    expect(tableMemo).toContain('Table rule')
    const per = (job.result as { perRedline: { id: string; mode: string }[] }).perRedline
    expect(per.find((e) => e.id === r.id)!.mode).toBe('tracked')
    expect(per.find((e) => e.id === inTable.id)!.mode).toBe('memo')
  })

  it('refuses a hand-written proposal whose words are not in the section', async () => {
    const env = await setup(provider(() => good))
    const r = await env.call('redlines:create', {
      redline: {
        projectId: 'x',
        source: { scenarioId: env.scenarioId, scenarioTitle: 'Flight' },
        target: {
          documentId: 'tirp',
          documentTitle: 'x',
          headingPath: HEADING,
          sourceKind: 'docx',
        },
        originalExcerpt: 'Words that are not in the plan.',
        proposedText: 'Other words.',
      },
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error.message).toContain('not in the section')
  })

  it('exports only accepted proposals and never into the documents folder', async () => {
    const env = await setup(provider(() => good))
    const [r] = await generate(env)
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-out-'))
    expect((await env.job('redlines:export', { ids: [r!.id], outDir })).status).toBe('error')
    await env.ok('redlines:set-status', { ids: [r!.id], to: 'accepted' })
    const inside = await env.job('redlines:export', {
      ids: [r!.id],
      outDir: join(env.root, 'documents'),
    })
    expect(inside.status).toBe('error')
    expect(inside.error).toContain('outside')
  })

  it('does not let an exported redline be edited', async () => {
    const env = await setup(provider(() => good))
    const r = await accepted(env)
    await env.job('redlines:export', {
      ids: [r.id],
      outDir: mkdtempSync(join(tmpdir(), 'ttx-out-')),
    })
    const edit = await env.call('redlines:update', { id: r.id, patch: { proposedText: 'other' } })
    expect(edit.ok).toBe(false)
  })

  it('sends an edited accepted proposal back to proposed', async () => {
    const env = await setup(provider(() => good))
    const r = await accepted(env)
    const edited = await env.ok<Redline>('redlines:update', {
      id: r.id,
      patch: { proposedText: 'The PIO releases it.' },
    })
    expect(edited.status).toBe('proposed')
    expect(edited.history.map((h) => h.to)).toEqual(['proposed', 'accepted', 'proposed'])
  })
})

describe('redlines:check-applied', () => {
  async function exportedRedline(env: Env): Promise<Redline> {
    const [r] = await generate(env)
    await env.ok('redlines:set-status', { ids: [r!.id], to: 'accepted' })
    return r!
  }

  async function newVersion(env: Env, text: string) {
    await addPlan(env.root, 'tirp2', 'tirp2.docx', text, await samplePlan())
    await mutateMeta(env.root, 'tirp2', (m) => ({ ...m, supersedesDocumentId: 'tirp' }))
  }

  it('marks a redline applied when the new plan has the proposed words and not the old ones', async () => {
    const env = await setup(provider(() => good))
    const r = await exportedRedline(env)
    const proposed = (MOCK_FIXTURES.RedlineOutput as { proposals: { proposedText: string }[] })
      .proposals[0]!.proposedText
    await newVersion(env, `${HEADING}\n\n${proposed}\n`)
    const [checked] = await env.ok<Redline[]>('redlines:check-applied', { documentId: 'tirp2' })
    expect(checked).toMatchObject({
      id: r.id,
      status: 'applied',
      appliedCheck: { result: 'applied', documentId: 'tirp2' },
    })
  })

  it('says not applied when the old words are still there, and needs review when neither is', async () => {
    const env = await setup(provider(() => good))
    const r = await exportedRedline(env)
    await newVersion(env, `${HEADING}\n\n${PIO_SENTENCE}\n`)
    expect(
      (await env.ok<Redline[]>('redlines:check-applied', { documentId: 'tirp2' }))[0]!.status,
    ).toBe('not_applied')
    await newVersion(env, 'The section was rewritten.')
    const again = await env.ok<Redline[]>('redlines:check-applied', { documentId: 'tirp2' })
    expect(again[0]).toMatchObject({ id: r.id, status: 'needs_review' })
  })

  it('refuses a document that replaces nothing', async () => {
    const env = await setup(provider(() => good))
    expect((await env.call('redlines:check-applied', { documentId: 'tirp' })).ok).toBe(false)
  })
})

describe('drills', () => {
  const startex = {
    situationMd: 'The terminal runs on manual procedures. The PIO waits for the IC.',
  }

  async function drillEnv() {
    const env = await setup(provider((n) => (n === 0 ? good : startex)))
    await generate(env)
    return env
  }

  it('drafts a drill from the rows whose criteria were not met or partial', async () => {
    const env = await drillEnv()
    const plan = await env.ok<{
      rowIds: string[]
      criterionIds: string[]
      correctiveActionIds: string[]
      redlineIds: string[]
      expectedDocumentIds: string[]
      actionCriteria: Record<string, string[]>
    }>('drills:draft', { scenarioId: env.scenarioId })
    expect(plan.rowIds).toEqual(['I-06', 'I-09'])
    expect(plan.criterionIds.sort()).toEqual(['T-07', 'T-14'])
    expect(plan.correctiveActionIds).toEqual(['CA1'])
    expect(plan.actionCriteria.CA1).toEqual(['I-06|T-07'])
    expect(plan.redlineIds).toHaveLength(1)
    expect(plan.expectedDocumentIds).toContain('tirp')
  })

  async function builtDrill(env: Env): Promise<{ drill: Drill; scenario: Scenario }> {
    const plan = await env.ok<Record<string, unknown>>('drills:draft', {
      scenarioId: env.scenarioId,
    })
    const drill = await env.ok<Drill>('drills:save', { drill: plan })
    const job = await env.job('drills:build-scenario', { id: drill.id })
    expect(job.status, job.error).toBe('done')
    const saved = await env.ok<Drill>('drills:get', { id: drill.id })
    return { drill: saved, scenario: await getScenario(env.root, saved.drillScenarioId!) }
  }

  it('builds a draft scenario with the same row ids, cards, one phase and the source untouched', async () => {
    const env = await drillEnv()
    const before = await getScenario(env.root, env.scenarioId)
    const { drill, scenario } = await builtDrill(env)
    expect(scenario.status).toBe('draft')
    expect(scenario.brief.drillOf).toEqual({ drillId: drill.id, sourceScenarioId: env.scenarioId })
    expect(scenario.msel.map((r) => r.id)).toEqual(['START', 'I-06', 'TJ-1', 'I-09', 'END'])
    expect(scenario.msel[0]!.event).toContain('manual procedures')
    expect(scenario.phases).toHaveLength(1)
    expect(new Set(scenario.msel.map((r) => r.phaseId))).toEqual(new Set(['drill']))
    expect(scenario.evaluation.eegs.length).toBeGreaterThan(0)
    // The three control cards come with their injects, so the drill is playable as built.
    const injects = await listInjects(env.root, scenario.id)
    expect(injects.map((i) => i.type).sort()).toEqual([
      'endex_card',
      'startex_card',
      'time_jump_card',
    ])
    expect(await getScenario(env.root, env.scenarioId)).toEqual(before)
  })

  it('records a run from the ratings of the drill scenario and verdicts per corrective action', async () => {
    const env = await drillEnv()
    const { drill, scenario } = await builtDrill(env)
    const rate = (id: string, rowId: string, taskId: string, rating: 'met' | 'not_met') =>
      upsertObservation(env.root, scenario.id, {
        id,
        at: '2026-06-10T10:00:00.000Z',
        rowId,
        taskId,
        rating,
        note: '',
        source: 'facilitate',
      })
    await rate('D-1', 'I-06', 'T-07', 'met')
    await rate('D-2', 'I-09', 'T-14', 'not_met')
    const saved = await env.ok<Drill>('drills:record-run', { id: drill.id })
    const run = saved.runs[0]!
    expect(run.criteria.find((c) => c.rowId === 'I-06' && c.criterionId === 'T-07')!.rating).toBe(
      'met',
    )
    expect(run.criteria.find((c) => c.rowId === 'I-09' && c.criterionId === 'T-14')!.rating).toBe(
      'not_met',
    )
    expect(run.correctiveActions).toEqual([{ id: 'CA1', verdict: 'pass' }])
    expect(run.documentHashes.tirp).toMatch(/^[0-9a-f]{64}$/)

    await rate('D-3', 'I-06', 'T-07', 'not_met')
    const second = await env.ok<Drill>('drills:record-run', { id: drill.id })
    expect(second.runs).toHaveLength(2)
    expect(second.runs[1]!.correctiveActions[0]!.verdict).toBe('fail')
  })

  it('records a run when the live session of the drill ends', async () => {
    const env = await drillEnv()
    const { drill, scenario } = await builtDrill(env)
    await upsertObservation(env.root, scenario.id, {
      id: 'D-1',
      at: '2026-06-10T10:00:00.000Z',
      rowId: 'I-06',
      taskId: 'T-07',
      rating: 'met',
      note: '',
      source: 'live',
    })
    await runSessionEndHooks(env.root, scenario.id, 'S1')
    expect((await env.ok<Drill>('drills:get', { id: drill.id })).runs).toHaveLength(1)
  })

  it('writes a pass to the program as verified and a fail as a verification only', async () => {
    const env = await drillEnv()
    const { drill, scenario } = await builtDrill(env)
    const program = await createProgram({
      parentDir: mkdtempSync(join(tmpdir(), 'ttx-prog-')),
      name: 'County',
      startYear: 2026,
    })
    const draft = (title: string) =>
      ProgramAction.parse({
        id: 'draft',
        programId: 'x',
        title,
        source: { kind: 'manual' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    // The drill names the AAR action by its AAR id; the program holds its own copy under that id.
    const view = await createAction(program, draft('Name an alternate approver'))
    const stored = await env.ok<Drill>('drills:get', { id: drill.id })
    await env.ok('drills:save', {
      drill: {
        ...stored,
        correctiveActionIds: [view.action.id],
        actionCriteria: { [view.action.id]: ['I-06|T-07'] },
      },
    })
    await upsertObservation(env.root, scenario.id, {
      id: 'D-1',
      at: '2026-06-10T10:00:00.000Z',
      rowId: 'I-06',
      taskId: 'T-07',
      rating: 'not_met',
      note: '',
      source: 'facilitate',
    })
    const failed = await env.ok<Drill>('drills:record-run', { id: drill.id })
    const { requireProgram } = await import('../../program/guard')
    await requireProgram(program)
    await env.ok('drills:record-program', {
      id: drill.id,
      runId: failed.runs[0]!.id,
      programPath: program,
    })
    let action = (await getAction(program, view.action.id)).action
    expect(action.status).toBe('open')
    expect(action.verifications[0]).toMatchObject({
      method: 'drill',
      result: 'fail',
      drillRunId: failed.runs[0]!.id,
    })

    await upsertObservation(env.root, scenario.id, {
      id: 'D-2',
      at: '2026-09-03T10:00:00.000Z',
      rowId: 'I-06',
      taskId: 'T-07',
      rating: 'met',
      note: '',
      source: 'facilitate',
    })
    const passed = await env.ok<Drill>('drills:record-run', { id: drill.id })
    const withProgram = await env.ok<Drill>('drills:record-program', {
      id: drill.id,
      runId: passed.runs[1]!.id,
      programPath: program,
    })
    action = (await getAction(program, view.action.id)).action
    expect(action.status).toBe('verified')
    expect(action.verifications.at(-1)!.result).toBe('pass')
    expect(withProgram.runs[1]!.programRecorded).toBe(true)
  })

  it('exports drill-results.csv and refuses before a run is recorded', async () => {
    const env = await drillEnv()
    const { drill, scenario } = await builtDrill(env)
    expect((await env.call('drills:export-results', { id: drill.id })).ok).toBe(false)
    await upsertObservation(env.root, scenario.id, {
      id: 'D-1',
      at: '2026-06-10T10:00:00.000Z',
      rowId: 'I-06',
      taskId: 'T-07',
      rating: 'met',
      note: '',
      source: 'facilitate',
    })
    await env.ok('drills:record-run', { id: drill.id })
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-out-'))
    vi.doMock('../../export/pdf', () => ({ htmlToPdf: async () => Buffer.from('%PDF') }))
    const job = await env.job('drills:export-results', { id: drill.id, outDir })
    expect(job.status, job.error).toBe('done')
    const csv = readFileSync(join(outDir, 'drill-results.csv'), 'utf8')
    expect(csv).toContain('Criterion,I-06,T-07,Met')
    expect(existsSync(join(outDir, 'drill-results.pdf'))).toBe(true)
  })
})
