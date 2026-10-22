// Inject stages against the real project/scenario stores, the shipped prompts, the mock
// provider (TTX_MOCK_PROVIDERS=1) and the fixture templates in tests/fixtures/injects. Only
// the search index and the PNG renderer are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Inject, Scenario } from '@shared/schemas'
import { MAX_INJECT_VERSIONS } from '@shared/schemas'
import type { ChatRequest, MediaJob, MediaOutput } from '../../providers/types'
import { FakeNciaIndex } from '../../../../tests/fixtures/generate/fakes'
import {
  FIELDS,
  fakeRenderer,
  injectTextResponder,
  isRepair,
  makeTestResources,
  mediaBriefResponder,
  rowAskedFor,
} from '../../../../tests/fixtures/injects/fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = makeTestResources()

const { dispatch } = await import('../../ipc/registry')
const { default: projectHandlers } = await import('../../ipc/handlers/project')
const { default: generateHandlers } = await import('../../ipc/handlers/generate')
const { default: injectHandlers } = await import('../../ipc/handlers/injects')
const { default: jobHandlers } = await import('../../ipc/handlers/jobs')
const { jobs } = await import('../../jobs/manager')
const { resetSettingsCache } = await import('../../settings/store')
const { resetResolveState, resolveMediaProvider } = await import('../../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../../providers/mock/adapter')
const { setPipelineDeps } = await import('../deps')
const { setInjectDeps } = await import('./deps')
const { createScenario, getScenario, saveScenario } = await import('../../scenario/store')

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
let index: FakeNciaIndex

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-inj-'))
  const created = await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' })
  projectPath = created.path
  const empty = await createScenario(projectPath, { title: 'S3', brief: FIXTURE.brief })
  const s = await saveScenario(
    projectPath,
    { ...FIXTURE, id: empty.id, projectId: created.project.id },
    { by: 'user' },
  )
  scenarioId = s.id
  index = new FakeNciaIndex()
  setPipelineDeps({ openIndex: async () => index })
  setInjectDeps({ renderer: fakeRenderer, applyPostFx: undefined })
  setMockResponse('InjectTextOutput', injectTextResponder)
  setMockResponse('MediaBriefOutput', mediaBriefResponder)
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
  setInjectDeps(undefined)
})

const S = () => ({ projectPath, scenarioId })

async function generateInjects(rowIds?: string[]) {
  const { jobId } = await invoke('generate:injects', { ...S(), ...(rowIds ? { rowIds } : {}) })
  const job = await jobs.wait(jobId)
  return {
    job,
    injects: await invoke('injects:list', S()),
    scenario: await getScenario(projectPath, scenarioId),
  }
}

const byRow = (injects: Inject[], rowId: string): Inject => {
  const i = injects.find((x) => x.mselRowId === rowId)
  if (!i) throw new Error(`no inject for ${rowId}`)
  return i
}

describe('generate:injects (text + media brief)', () => {
  it('writes one inject per MSEL row, template-backed types where possible, with provenance', async () => {
    const { job, injects, scenario: s } = await generateInjects()
    expect(job.status, job.error).toBe('done')
    expect(job.result).toMatchObject({ failed: [], skipped: [] })
    expect(injects).toHaveLength(FIXTURE.msel.length)
    // Control rows became control cards regardless of format.
    expect(byRow(injects, 'START').type).toBe('startex_card')
    expect(byRow(injects, 'I-05').type).toBe('time_jump_card')
    expect(byRow(injects, 'END').type).toBe('endex_card')
    // Format kept when installed; closest template otherwise; no template → type kept.
    expect(byRow(injects, 'I-04').type).toBe('tweet')
    expect(byRow(injects, 'I-08b').type).toBe('memo') // email_forward → email → memo
    expect(byRow(injects, 'I-10').type).toBe('scene_photo')
    expect(byRow(injects, 'I-01').type).toBe('radio_call') // phone_call → radio_call
    // Rows link to injects; every inject has an ok inject_text run and a media brief.
    for (const row of s.msel) {
      const inject = byRow(injects, row.id)
      expect(row.injectId, row.id).toBe(inject.id)
      expect(inject.versions).toHaveLength(1)
      expect(inject.versions[0]?.by).toBe('ai')
      expect(inject.mediaBrief?.paths.length, row.id).toBeGreaterThan(0)
      const run = s.provenance.find((r) => r.stage === 'inject_text' && r.itemId === inject.id)
      expect(run?.status, row.id).toBe('ok')
      expect(run?.promptHash).toMatch(/^[0-9a-f]{64}$/)
      expect(run?.providerRef?.providerId).toBe('mock')
    }
    // Citations resolve to chunks; keys never leak into fields.
    const i04 = byRow(injects, 'I-04')
    expect(i04.citations[0]?.chunkId).toBeDefined()
    expect(i04.fields).toEqual(FIELDS.tweet)
    expect(i04.title).toBe('I-04 tweet')
    // The fallback is reported as an info warning, the missing template too.
    const codes = s.warnings.filter((w) => w.rowId === 'I-08b').map((w) => w.code)
    expect(codes).toContain('INJECT_TYPE_FALLBACK')
    expect(s.warnings.find((w) => w.rowId === 'I-10')?.code).toBe('INJECT_TEMPLATE_MISSING')
    expect(s.warnings.filter((w) => w.code === 'INJECT_FIELDS_INVALID')).toEqual([])
    // Media briefs: tweet with a photo gets ai_image + the photo slot; FIDS is template only
    // (no model call → skipped run); radio call gets tts with radio FX and real voice lines.
    expect(i04.mediaBrief?.paths).toEqual(['template', 'ai_image'])
    expect(i04.mediaBrief?.imagePrompt).not.toMatch(/no readable text|no logos/)
    expect(i04.mediaBrief?.negativePrompt).toMatch(/^text, letters/)
    expect(byRow(injects, 'I-06').mediaBrief?.paths).toEqual(['template'])
    const briefRun = s.provenance.find(
      (r) => r.stage === 'inject_media_brief' && r.itemId === byRow(injects, 'I-06').id,
    )
    expect(briefRun?.status).toBe('skipped')
    const radio = byRow(injects, 'I-05b').mediaBrief
    expect(radio?.paths).toEqual(['template', 'tts'])
    expect(radio?.postFx).toEqual(['radio'])
    expect(radio?.voiceLines?.map((l) => l.speaker)).toEqual(['Parking 3', 'Ops'])
    expect(byRow(injects, 'I-10').mediaBrief?.paths).toEqual(['ai_image'])
    // A second plain run finds nothing to do (gaps only); explicit rows regenerate.
    const again = await generateInjects()
    expect(again.job.result).toMatchObject({ generated: [] })
  })

  it('shows the model the template schema and the facts so far; story stays consistent', async () => {
    const prompts = new Map<string, string>()
    const contexts = new Map<string, string>()
    setMockResponse('InjectTextOutput', (req: ChatRequest) => {
      prompts.set(rowAskedFor(req), req.messages[0]!.content)
      contexts.set(rowAskedFor(req), req.cacheableContext ?? '')
      return injectTextResponder(req)
    })
    const { job } = await generateInjects(['I-02a', 'I-09'])
    expect(job.status, job.error).toBe('done')
    const ticket = prompts.get('I-02a')!
    expect(ticket).toContain('Template fields for helpdesk_ticket')
    expect(ticket).toContain('- ticketNo (string, required) — Ticket number — e.g. "4492"')
    expect(ticket).toContain('- priority (one of "Low" | "Medium" | "High" | "Critical", required)')
    expect(ticket).toContain('Story so far')
    expect(ticket).toContain('I-01 ')
    expect(ticket).not.toContain('I-03 ')
    const log = prompts.get('I-09')!
    expect(log).toContain('Facts already established')
    expect(log).toMatch(/hosts: .*OPS_INTERN_03 \(I-08b\)/)
    expect(log).toMatch(/tickets: .*4492 \(I-02a\)/)
    expect(log).toContain('Injects already written: I-02a (helpdesk_ticket)')
    expect(contexts.get('I-09')).toContain('<documents>')
  })

  it('repairs fields that fail the template schema once, then keeps the page with a warning', async () => {
    const calls: { row: string; repair: boolean }[] = []
    setMockResponse('InjectTextOutput', (req: ChatRequest) => {
      const row = rowAskedFor(req)
      const repair = isRepair(req)
      calls.push({ row, repair })
      const out = injectTextResponder(req)
      // I-02a: a stray key (dropped in code) plus a bad enum value (needs the repair call).
      if (row === 'I-02a' && !repair)
        return { ...out, fields: { ...out.fields, priority: 'Urgent', extra: 'never allowed' } }
      // I-07: a wrong type the model never fixes → kept with a warning.
      if (row === 'I-07') return { ...out, fields: { ...out.fields, body: 123 } }
      return out
    })
    const { job, injects, scenario: s } = await generateInjects(['I-02a', 'I-07'])
    expect(job.status, job.error).toBe('done')
    expect(calls).toEqual([
      { row: 'I-02a', repair: false },
      { row: 'I-02a', repair: true },
      { row: 'I-07', repair: false },
      { row: 'I-07', repair: true },
    ])
    // Repaired: valid fields, one repair attempt recorded.
    const ticket = byRow(injects, 'I-02a')
    expect(ticket.fields).toEqual(FIELDS.helpdesk_ticket)
    const run = s.provenance.find((r) => r.stage === 'inject_text' && r.itemId === ticket.id)
    expect(run).toMatchObject({ status: 'ok', repairAttempts: 1 })
    expect(run!.inputTokens!).toBeGreaterThan(0)
    expect(
      s.warnings.filter((w) => w.injectId === ticket.id && w.code === 'INJECT_FIELDS_INVALID'),
    ).toEqual([])
    expect(
      jobs.logOf(job.id).entries.some((e) => /dropped field\(s\).*: extra$/.test(e.message)),
    ).toBe(true)
    // Still invalid after the repair: kept, flagged, job not failed.
    const memo = byRow(injects, 'I-07')
    expect(memo.fields.body).toBe(123)
    const warning = s.warnings.find(
      (w) => w.injectId === memo.id && w.code === 'INJECT_FIELDS_INVALID',
    )
    expect(warning?.message).toMatch(/fields\/body: must be string/)
    expect(warning?.rowId).toBe('I-07')

    // A user save that still fails the schema keeps the warning; fixing the fields clears it.
    await invoke('injects:save', { ...S(), inject: { ...memo, title: 'still broken' } })
    const flagged = (w: { injectId?: string; code: string }) =>
      w.injectId === memo.id && w.code === 'INJECT_FIELDS_INVALID'
    expect((await getScenario(projectPath, scenarioId)).warnings.some(flagged)).toBe(true)
    await invoke('injects:save', { ...S(), inject: { ...memo, fields: FIELDS.memo! } })
    const after = await getScenario(projectPath, scenarioId)
    expect(after.warnings.some(flagged)).toBe(false)
    expect(after.warnings.length).toBe(s.warnings.length - 1)
  })

  it('skips locked rows and locked injects; regenerate-text refuses a locked inject', async () => {
    const first = await generateInjects(['I-01', 'I-02a'])
    const locked = byRow(first.injects, 'I-02a')
    await invoke('injects:save', { ...S(), inject: { ...locked, locked: true } })
    await saveScenario(
      projectPath,
      {
        ...(await getScenario(projectPath, scenarioId)),
        msel: first.scenario.msel.map((r) => (r.id === 'I-01' ? { ...r, locked: true } : r)),
      },
      { by: 'user' },
    )
    const { job, injects } = await generateInjects(['I-01', 'I-02a', 'I-03'])
    expect(job.status, job.error).toBe('done')
    expect(job.result).toMatchObject({
      generated: ['I-03'],
      skipped: [
        { rowId: 'I-01', reason: 'locked' },
        { rowId: 'I-02a', reason: 'locked' },
      ],
    })
    expect(byRow(injects, 'I-01').versions).toHaveLength(1)
    await expect(
      invoke('injects:regenerate-text', { ...S(), injectId: locked.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('keeps a capped version history across ai and user saves; restore-version works', async () => {
    const { injects } = await generateInjects(['I-04'])
    const tweet = byRow(injects, 'I-04')
    const prompts: string[] = []
    setMockResponse('InjectTextOutput', (req: ChatRequest) => {
      prompts.push(req.messages[0]!.content)
      return { ...injectTextResponder(req), title: 'Regenerated tweet' }
    })
    const { jobId } = await invoke('injects:regenerate-text', {
      ...S(),
      injectId: tweet.id,
      instructions: 'Make the passenger angrier.',
    })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    expect(prompts[0]).toContain('Make the passenger angrier.')
    expect(prompts[0]).toContain('Current version of this inject')
    let current = await invoke('injects:get', { ...S(), injectId: tweet.id })
    expect(current.id).toBe(tweet.id)
    expect(current.title).toBe('Regenerated tweet')
    expect(current.versions.map((v) => v.by)).toEqual(['ai', 'ai'])
    expect(current.versions[1]?.note).toBe('regenerated with instructions')
    // User saves add user versions; the cap holds.
    for (let i = 0; i < MAX_INJECT_VERSIONS + 3; i++) {
      current = await invoke('injects:save', {
        ...S(),
        inject: { ...current, title: `v${i}` },
        note: `edit ${i}`,
      })
    }
    expect(current.versions).toHaveLength(MAX_INJECT_VERSIONS)
    expect(current.versions.at(-1)).toMatchObject({
      by: 'user',
      note: `edit ${MAX_INJECT_VERSIONS + 2}`,
    })
    expect(current.versions[0]?.snapshot.title).not.toBe('I-04 tweet')
    // Restore the oldest kept snapshot: content comes back, the restore is a new user version.
    const restored = await invoke('injects:restore-version', {
      ...S(),
      injectId: tweet.id,
      versionIndex: 0,
    })
    expect(restored.title).toBe(current.versions[0]!.snapshot.title)
    expect(restored.versions).toHaveLength(MAX_INJECT_VERSIONS)
    expect(restored.versions.at(-1)?.note).toMatch(/^restored version 1/)
    await expect(
      invoke('injects:restore-version', { ...S(), injectId: tweet.id, versionIndex: 99 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('records a failed inject_text run and continues with the other rows', async () => {
    setMockResponse('InjectTextOutput', (req: ChatRequest) =>
      rowAskedFor(req) === 'I-02a' ? { nonsense: true } : injectTextResponder(req),
    )
    const { job, injects, scenario: s } = await generateInjects(['I-01', 'I-02a', 'I-03'])
    expect(job.status, job.error).toBe('done')
    expect(job.result).toMatchObject({ generated: ['I-01', 'I-03'], failed: [{ rowId: 'I-02a' }] })
    expect(injects.map((i) => i.mselRowId)).toEqual(['I-01', 'I-03'])
    const failed = s.provenance.find((r) => r.stage === 'inject_text' && r.itemId === 'I-02a')
    expect(failed?.status).toBe('error')
    expect(failed?.error).toMatch(/InjectTextOutput|invalid|Mock/i)
    expect(s.msel.find((r) => r.id === 'I-02a')?.injectId).toBeUndefined()
  })

  it('refuses a second generation job on the same scenario', async () => {
    const { jobId } = await invoke('generate:injects', { ...S(), rowIds: ['I-01'] })
    await expect(invoke('generate:injects', S())).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(invoke('generate:media', S())).rejects.toMatchObject({ code: 'CONFLICT' })
    await jobs.wait(jobId)
    const second = await invoke('generate:injects', { ...S(), rowIds: ['I-01'] })
    expect((await jobs.wait(second.jobId)).status).toBe('done')
  })
})

describe('generate:media', () => {
  const mediaFiles = (injectId: string): string[] =>
    readdirSync(join(projectPath, 'scenarios', scenarioId, 'media', injectId)).sort()

  it('renders image → composite template → tts per inject, with provenance and relative paths', async () => {
    const text = await generateInjects(['I-04', 'I-05b', 'I-06', 'I-10', 'I-07'])
    expect(text.job.status, text.job.error).toBe('done')
    const { jobId } = await invoke('generate:media', S())
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    expect(
      job.result,
      jobs
        .logOf(job.id)
        .entries.map((e) => e.message)
        .join('\n'),
    ).toMatchObject({ failed: [] })
    const injects = await invoke('injects:list', S())
    // Tweet: generated photo (slot id) + composite PNG.
    const tweet = byRow(injects, 'I-04')
    expect(tweet.assets.map((a) => `${a.kind}:${a.role}`).sort()).toEqual([
      'image:composite',
      'image:generated',
    ])
    const photo = tweet.assets.find((a) => a.role === 'generated')!
    expect(photo.id).toMatch(/^photo-[0-9A-Z]{26}$/)
    expect(photo.path).toBe(`scenarios/${scenarioId}/media/${tweet.id}/${photo.id}.png`)
    expect(photo.provenance).toMatchObject({
      provider: 'mock',
      model: 'mock',
      createdAt: expect.any(String),
    })
    // The style/setting anchors lead; the model's own prompt follows.
    expect(photo.provenance.prompt).toMatch(
      /^Candid smartphone snapshot.*airport passenger terminal/,
    )
    expect(photo.provenance.prompt).toContain('Phone snapshot')
    expect(photo.provenance.negativePrompt).toMatch(/^text, letters/)
    expect(photo.sha256).toMatch(/^[0-9a-f]{64}$/)
    const composite = tweet.assets.find((a) => a.role === 'composite')!
    expect(composite.provenance).toMatchObject({
      provider: 'template',
      templateId: 'tweet',
      templateVersion: '1',
    })
    expect(mediaFiles(tweet.id)).toEqual([`${photo.id}.png`, `${composite.id}.png`].sort())
    // Radio call: rendered transcript card + WAV with duration; post-FX skipped (not installed) → no postFx in provenance.
    const radio = byRow(injects, 'I-05b')
    const wav = radio.assets.find((a) => a.kind === 'audio')!
    expect(wav).toMatchObject({ role: 'generated', durationSec: 1 })
    expect(wav.path).toMatch(
      new RegExp(`^scenarios/${scenarioId}/media/${radio.id}/[0-9A-Z]{26}\\.wav$`),
    )
    expect(wav.provenance.postFx).toBeUndefined()
    expect(radio.assets.some((a) => a.role === 'rendered')).toBe(true)
    // FIDS: template only. Memo: paper → PNG + PDF. Scene photo: AI only.
    expect(byRow(injects, 'I-06').assets.map((a) => a.role)).toEqual(['rendered'])
    expect(
      byRow(injects, 'I-07')
        .assets.map((a) => a.kind)
        .sort(),
    ).toEqual(['image', 'pdf'])
    expect(byRow(injects, 'I-10').assets.map((a) => `${a.kind}:${a.role}`)).toEqual([
      'image:generated',
    ])
    // One media_render run per inject, all ok; the job log mentions the skipped FX.
    const s = await getScenario(projectPath, scenarioId)
    const runs = s.provenance.filter((r) => r.stage === 'media_render')
    expect(runs).toHaveLength(5)
    expect(runs.every((r) => r.status === 'ok')).toBe(true)
    expect(jobs.logOf(job.id).entries.some((e) => /post-FX radio skipped/.test(e.message))).toBe(
      true,
    )
    // Re-rendering replaces the previous files instead of piling up.
    const again = await invoke('injects:regenerate-media', { ...S(), injectId: tweet.id })
    expect((await jobs.wait(again.jobId)).status).toBe('done')
    const tweet2 = await invoke('injects:get', { ...S(), injectId: tweet.id })
    expect(tweet2.assets).toHaveLength(2)
    expect(mediaFiles(tweet.id)).toHaveLength(2)
    expect(mediaFiles(tweet.id)).not.toContain(`${photo.id}.png`)
    expect(tweet2.versions, 'media never adds text versions').toHaveLength(1)
  })

  it('applies the post-FX chain when it is installed and records it', async () => {
    await generateInjects(['I-05b'])
    setInjectDeps({
      renderer: fakeRenderer,
      applyPostFx: async ({ wavPath }) => {
        const out = wavPath.replace(/\.wav$/, '-fx.wav')
        copyFileSync(wavPath, out)
        return { wavPath: out }
      },
    })
    const { jobId } = await invoke('generate:media', S())
    expect((await jobs.wait(jobId)).status).toBe('done')
    const wav = byRow(await invoke('injects:list', S()), 'I-05b').assets.find(
      (a) => a.kind === 'audio',
    )!
    expect(wav.provenance.postFx).toEqual(['radio'])
  }, 30000)

  it('keeps going when one step fails: the template still renders, the failure is summarised', async () => {
    const text = await generateInjects(['I-04', 'I-06b', 'I-06'])
    const fbId = byRow(text.injects, 'I-06b').id
    const real = resolveMediaProvider
    setInjectDeps({
      renderer: fakeRenderer,
      resolveMediaProvider: async (task, root) => {
        const r = await real(task, root)
        const provider = {
          ...r.provider,
          capabilities: () => r.provider.capabilities(),
          generate: (
            job: MediaJob,
            onProgress?: (p: { progress: number }) => void,
          ): Promise<MediaOutput[]> => {
            if (job.kind === 'image' && job.injectId === fbId)
              return Promise.reject(new Error('ComfyUI queue timeout'))
            return r.provider.generate(job, onProgress)
          },
        }
        return { ...r, provider }
      },
    })
    setMockResponse('MediaBriefOutput', (req: ChatRequest) => {
      const out = mediaBriefResponder(req)
      if (/facebook_post/.test(req.messages[0]!.content))
        out.imagePrompt = 'facebook photo of a crowd'
      return out
    })
    const { jobId } = await invoke('generate:media', S())
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    expect(job.result).toMatchObject({
      failed: [{ rowId: 'I-06b', path: 'ai_image', error: 'ComfyUI queue timeout' }],
    })
    const injects = await invoke('injects:list', S())
    expect(byRow(injects, 'I-06b').assets.map((a) => a.role)).toEqual(['rendered'])
    expect(byRow(injects, 'I-04').assets).toHaveLength(2)
    const s = await getScenario(projectPath, scenarioId)
    const fb = byRow(injects, 'I-06b')
    expect(
      s.provenance.find((r) => r.stage === 'media_render' && r.itemId === fb.id),
    ).toMatchObject({
      status: 'ok',
      error: 'template rendered; ai_image: ComfyUI queue timeout',
    })
    expect(s.warnings.find((w) => w.code === 'INJECT_MEDIA_FAILED')).toMatchObject({
      rowId: 'I-06b',
      injectId: fb.id,
    })
  })

  it('fails the job when nothing could be rendered', async () => {
    await generateInjects(['I-06'])
    setInjectDeps({
      renderer: async () => {
        throw new Error('render window crashed')
      },
    })
    const { jobId } = await invoke('generate:media', S())
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/No media could be rendered: render window crashed/)
  })
})

describe('injects:* and library:* handlers', () => {
  it('create, get, delete (with media folder) and path guards', async () => {
    const created = await invoke('injects:create', { ...S(), mselRowId: 'I-01', type: 'memo' })
    expect(created).toMatchObject({
      mselRowId: 'I-01',
      type: 'memo',
      fields: {},
      deliveryMode: 'hand_to_role',
    })
    expect(
      (await getScenario(projectPath, scenarioId)).msel.find((r) => r.id === 'I-01')?.injectId,
    ).toBe(created.id)
    await expect(
      invoke('injects:create', { ...S(), mselRowId: 'I-01', type: 'memo' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      invoke('injects:create', { ...S(), mselRowId: 'I-99', type: 'memo' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      invoke('injects:get', { ...S(), injectId: '../../project' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(invoke('injects:get', { ...S(), injectId: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      invoke('injects:list', { projectPath: '/nowhere', scenarioId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // Render media for it, then delete: file, media folder, row link and runs all go.
    await invoke('injects:save', { ...S(), inject: { ...created, fields: FIELDS.memo! } })
    const { jobId } = await invoke('injects:regenerate-media', { ...S(), injectId: created.id })
    expect((await jobs.wait(jobId)).status).toBe('done')
    const mediaDir = join(projectPath, 'scenarios', scenarioId, 'media', created.id)
    expect(existsSync(mediaDir)).toBe(true)
    await invoke('injects:delete', { ...S(), injectId: created.id })
    expect(existsSync(mediaDir)).toBe(false)
    expect(
      existsSync(join(projectPath, 'scenarios', scenarioId, 'injects', `${created.id}.json`)),
    ).toBe(false)
    const s = await getScenario(projectPath, scenarioId)
    expect(s.msel.find((r) => r.id === 'I-01')?.injectId).toBeUndefined()
    expect(s.provenance.filter((r) => r.itemId === created.id)).toEqual([])
    expect(existsSync(join(projectPath, 'scenarios', scenarioId, 'scenario.json'))).toBe(true)
  })

  it('a user save keeps the asset list the media job owns', async () => {
    await generateInjects(['I-06'])
    const { jobId } = await invoke('generate:media', S())
    await jobs.wait(jobId)
    const before = byRow(await invoke('injects:list', S()), 'I-06')
    const saved = await invoke('injects:save', {
      ...S(),
      inject: { ...before, assets: [], title: 'edited' },
    })
    expect(saved.title).toBe('edited')
    expect(saved.assets).toEqual(before.assets)
    expect(saved.versions.at(-1)?.by).toBe('user')
  })

  it('library: save an inject, list, insert into another row, delete', async () => {
    const { injects } = await generateInjects(['I-02a'])
    const ticket = byRow(injects, 'I-02a')
    const item = await invoke('library:save', {
      ...S(),
      injectId: ticket.id,
      name: 'Vending machine noise',
    })
    expect(item).toMatchObject({
      name: 'Vending machine noise',
      type: 'helpdesk_ticket',
      fields: FIELDS.helpdesk_ticket,
    })
    expect(existsSync(join(process.env.TTX_USER_DATA!, 'library', `${item.id}.json`))).toBe(true)
    expect(await invoke('library:list', undefined)).toEqual([item])
    const inserted = await invoke('library:insert', {
      ...S(),
      libraryId: item.id,
      mselRowId: 'I-13b',
    })
    expect(inserted).toMatchObject({
      mselRowId: 'I-13b',
      type: 'helpdesk_ticket',
      fields: FIELDS.helpdesk_ticket,
    })
    expect(inserted.versions[0]?.note).toBe('inserted from library "Vending machine noise"')
    expect(
      (await getScenario(projectPath, scenarioId)).msel.find((r) => r.id === 'I-13b')?.injectId,
    ).toBe(inserted.id)
    await expect(
      invoke('library:insert', { ...S(), libraryId: 'missing', mselRowId: 'I-14b' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(invoke('library:delete', { id: '../settings' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await invoke('library:delete', { id: item.id })
    expect(await invoke('library:list', undefined)).toEqual([])
  })
})
