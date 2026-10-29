// Integration (#425): hot wash channels through the IPC dispatcher on a real project folder.
// Records through hotwash:append, transcribes with the mock speech provider as a job, edits and
// marks a quote, reads the AAR input, redacts, and checks audio retention and the local-only
// rule for transcription.
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HotwashListing } from '@shared/ipc'
import type { AarTranscriptCite, HotwashRecording, Transcript } from '@shared/schemas/hotwash'

const mic = vi.hoisted(() => ({ status: 'granted' }))
vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
  systemPreferences: {
    getMediaAccessStatus: () => mic.status,
    askForMediaAccess: async () => false,
  },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./hotwash')).default
const { createProject } = await import('../../project/store')
const { createScenario } = await import('../../scenario/store')
const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')
const { jobs } = await import('../../jobs/manager')
const { onEmit } = await import('../../lib/events')
const { ScenarioBrief } = await import('@shared/schemas')
const { isArmed } = await import('../../hotwash/permissions')

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

async function setup(opts: { mock?: boolean } = { mock: true }) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  if (opts.mock) process.env.TTX_MOCK_PROVIDERS = '1'
  else delete process.env.TTX_MOCK_PROVIDERS
  resetSettingsCache()
  resetResolveState()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-hotwash-ipc-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'Hot wash' })
  const s = await createScenario(projectPath, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  const base = { projectPath, scenarioId: s.id }
  const call = async <T>(channel: string, req: Record<string, unknown> | undefined = {}) =>
    (await dispatch(handlers, channel as never, req && { ...base, ...req })) as Result<T>
  const ok = async <T>(channel: string, req: Record<string, unknown> = {}) => {
    const r = await call<T>(channel, req)
    if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
    return r.data
  }
  return { call, ok, base }
}

/** Record `seconds` of tone through the IPC channels, as the renderer does. */
async function record(ok: Awaited<ReturnType<typeof setup>>['ok'], seconds: number) {
  const rec = await ok<HotwashRecording>('hotwash:record-start', {
    consent: true,
    title: 'Hot wash',
  })
  for (let i = 0; i < seconds; i++) {
    const pcm = new Uint8Array(
      Int16Array.from({ length: 16_000 }, (_, n) => Math.sin(n / 5) * 8000).buffer,
    )
    await ok('hotwash:append', { recordingId: rec.id, seq: i, pcm })
  }
  return ok<HotwashRecording>('hotwash:record-stop', { recordingId: rec.id })
}

async function transcribe(ok: Awaited<ReturnType<typeof setup>>['ok'], recordingId: string) {
  const { jobId } = await ok<{ jobId: string }>('hotwash:transcribe', { recordingId })
  const job = await jobs.wait(jobId)
  expect(job.status, job.error).toBe('done')
  return job
}

afterEach(() => {
  delete process.env.TTX_MOCK_PROVIDERS
})

describe('hotwash handlers', () => {
  it('records, transcribes with the routed local provider and deletes the audio by default', async () => {
    const { ok } = await setup()
    const events: unknown[] = []
    const off = onEmit((name, payload) => name === 'hotwash:recording' && events.push(payload))
    const rec = await record(ok, 12)
    off()
    expect(events).toEqual([
      { recording: true, notice: true },
      { recording: false, notice: false },
    ])
    expect(rec).toMatchObject({ status: 'ready', durationSec: 12, source: 'microphone' })
    expect(rec.consentConfirmedAt).toBeDefined()

    const job = await transcribe(ok, rec.id)
    // Job payloads name ids and models, never transcript text.
    expect(JSON.stringify(job.payload)).not.toContain('Mock transcript')
    const listing = await ok<HotwashListing>('hotwash:list')
    const [t] = listing.transcripts
    expect(t).toMatchObject({ recordingId: rec.id, providerId: 'mock', complete: true })
    expect(t!.segments.map((s) => [s.startSec, s.text])).toEqual([
      [0, 'Mock transcript at 0 seconds.'],
      [5, 'Mock transcript at 5 seconds.'],
      [10, 'Mock transcript at 10 seconds.'],
    ])
    const after = listing.recordings[0]!
    expect(after.status).toBe('transcribed')
    expect(after.audioPath).toBeUndefined()
    expect(t!.redactions).toEqual([expect.objectContaining({ kind: 'audio' })])
  })

  it('keeps the audio when the project says so', async () => {
    const { ok, base } = await setup()
    await ok('hotwash:settings-save', { projectPath: base.projectPath, patch: { keepAudio: true } })
    const rec = await record(ok, 3)
    await transcribe(ok, rec.id)
    const { recordings } = await ok<HotwashListing>('hotwash:list')
    expect(recordings[0]!.audioPath).toBeDefined()
    expect(existsSync(join(base.projectPath, recordings[0]!.audioPath!))).toBe(true)
  })

  it('saves edits and quotes, hands quotes to the AAR, and never returns redacted text', async () => {
    const { ok, call } = await setup()
    const rec = await record(ok, 12)
    await transcribe(ok, rec.id)
    let t = (await ok<HotwashListing>('hotwash:list')).transcripts[0]!
    const edited: Transcript = {
      ...t,
      segments: t.segments.map((s, i) =>
        i === 0
          ? {
              ...s,
              text: 'We lost twenty minutes.',
              speaker: { label: 'Ops Director' },
              quote: { objectiveIds: ['OBJ2'], rowIds: ['I-07'] },
            }
          : s,
      ),
    }
    t = await ok<Transcript>('hotwash:transcript-save', {
      recordingId: rec.id,
      transcript: edited,
      revision: t.revision,
    })
    expect(t.segments[0]!.originalText).toBe('Mock transcript at 0 seconds.')
    const stale = await call('hotwash:transcript-save', {
      recordingId: rec.id,
      transcript: edited,
      revision: t.revision - 1,
    })
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })

    const quotes = await ok<AarTranscriptCite[]>('hotwash:transcripts', {})
    expect(quotes).toEqual([
      expect.objectContaining({
        citeKey: 'T1',
        ref: `transcript:${t.id}#${t.segments[0]!.id}`,
        at: '0:00:00',
        speakerLabel: 'Ops Director',
        text: 'We lost twenty minutes.',
        quote: true,
        objectiveIds: ['OBJ2'],
        rowIds: ['I-07'],
      }),
    ])
    expect(
      (await ok<AarTranscriptCite[]>('hotwash:transcripts', { quotesOnly: false })).length,
    ).toBe(3)

    await ok('hotwash:redact', { recordingId: rec.id, segmentId: t.segments[0]!.id })
    expect(await ok<AarTranscriptCite[]>('hotwash:transcripts', {})).toEqual([])
    const all = await ok<AarTranscriptCite[]>('hotwash:transcripts', { quotesOnly: false })
    expect(all.map((c) => c.text)).not.toContain('We lost twenty minutes.')
    expect(all).toHaveLength(2)
  })

  it('refuses to transcribe a finished transcript again unless asked, then replaces it', async () => {
    const { ok, call, base } = await setup()
    await ok('hotwash:settings-save', { projectPath: base.projectPath, patch: { keepAudio: true } })
    const rec = await record(ok, 6)
    await transcribe(ok, rec.id)
    const again = await call('hotwash:transcribe', { recordingId: rec.id })
    expect(again).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    const { jobId } = await ok<{ jobId: string }>('hotwash:transcribe', {
      recordingId: rec.id,
      restart: true,
    })
    expect((await jobs.wait(jobId)).status).toBe('done')
  })

  it('refuses a transcription provider on another computer', async () => {
    const { call } = await setup({ mock: false })
    await updateSettings((s) => {
      s.providers.push({
        id: 'cloud',
        kind: 'openai-compatible',
        label: 'Hosted Whisper',
        baseUrl: 'https://api.example.com/v1',
        options: {},
        enabled: true,
      })
      s.defaultRouting = { transcribe: { providerId: 'cloud' } }
    })
    const r1 = await call<HotwashRecording>('hotwash:record-start', { consent: true })
    if (!r1.ok) throw new Error(r1.error.message)
    await call('hotwash:append', {
      recordingId: r1.data.id,
      seq: 0,
      pcm: new Uint8Array(32_000),
    })
    await call('hotwash:record-stop', { recordingId: r1.data.id })
    const r = await call('hotwash:transcribe', { recordingId: r1.data.id })
    expect(r).toMatchObject({ ok: false, error: { code: 'PROVIDER' } })
    expect(!r.ok && r.error.message).toMatch(/runs only on this computer/)
  })

  it('needs a downloaded model for the built-in provider', async () => {
    const { ok, call } = await setup({ mock: false })
    const rec = await record(ok, 1)
    const r = await call('hotwash:transcribe', { recordingId: rec.id })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(!r.ok && r.error.message).toMatch(/not downloaded/)
  })

  it('validates appends: consent is required and chunks are capped', async () => {
    const { call, ok } = await setup()
    expect(await call('hotwash:record-start', {})).toMatchObject({ ok: false })
    const rec = await ok<HotwashRecording>('hotwash:record-start', { consent: true })
    const big = await call('hotwash:append', {
      recordingId: rec.id,
      seq: 0,
      pcm: new Uint8Array(70_000),
    })
    expect(big).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const notBytes = await call('hotwash:append', { recordingId: rec.id, seq: 0, pcm: [1, 2] })
    expect(notBytes).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const busy = await call('hotwash:delete', { recordingId: rec.id })
    expect(busy).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect((await ok<HotwashListing>('hotwash:list')).activeRecordingId).toBe(rec.id)
    await ok('hotwash:record-stop', { recordingId: rec.id })
    await ok('hotwash:delete', { recordingId: rec.id })
    expect((await ok<HotwashListing>('hotwash:list')).recordings).toEqual([])
  })

  it('arms the microphone for one request window, and disarms once recording starts', async () => {
    const { ok } = await setup()
    const res = await dispatch(handlers, 'hotwash:mic-arm' as never, undefined)
    expect(res).toMatchObject({ ok: true, data: { access: 'granted' } })
    expect(isArmed()).toBe(true)
    await ok<HotwashRecording>('hotwash:record-start', { consent: true }).then((r) =>
      ok('hotwash:record-stop', { recordingId: r.id }),
    )
    expect(isArmed()).toBe(false)
  })

  it.skipIf(process.platform !== 'darwin')(
    'does not arm when macOS has microphone access off',
    async () => {
      await setup()
      mic.status = 'denied'
      try {
        const res = await dispatch(handlers, 'hotwash:mic-arm' as never, undefined)
        expect(res).toMatchObject({ ok: true, data: { access: 'denied' } })
        expect(isArmed()).toBe(false)
      } finally {
        mic.status = 'granted'
      }
    },
  )

  it('imports decoded audio as a recording that keeps only the file name', async () => {
    const { ok } = await setup()
    const rec = await ok<HotwashRecording>('hotwash:import-start', {
      name: 'C:\\Users\\pio\\Desktop\\debrief phone.m4a',
      durationSec: 2,
    })
    expect(rec).toMatchObject({
      source: 'import',
      importedFrom: 'debrief phone.m4a',
      title: 'debrief phone',
    })
    await ok('hotwash:append', { recordingId: rec.id, seq: 0, pcm: new Uint8Array(64_000) })
    const done = await ok<HotwashRecording>('hotwash:record-stop', { recordingId: rec.id })
    expect(done.durationSec).toBe(2)
  })
})

describe('speech model channels', () => {
  it('lists the built-in models with one recommended and none downloaded', async () => {
    await setup()
    const r = (await dispatch(handlers, 'providers:speech-models' as never, undefined)) as Result<
      { name: string; downloaded: boolean; recommended: boolean }[]
    >
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.map((m) => m.name)).toEqual([
      'whisper-tiny.en',
      'whisper-base',
      'whisper-small',
      'whisper-large-v3-turbo',
    ])
    expect(r.data.filter((m) => m.recommended)).toHaveLength(1)
    expect(r.data.every((m) => !m.downloaded)).toBe(true)
  })

  it('refuses an unknown model name', async () => {
    await setup()
    const r = await dispatch(handlers, 'providers:download-speech-model' as never, {
      model: '../../etc',
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })
})
