// Hot wash recording and transcription (#425). Chromium's fake microphone plays the bundled
// sample (tests/fixtures/hotwash/hotwash-sample.wav); the app records it from Facilitate after
// the consent dialog, stops, transcribes with the mock speech provider, a quote is marked in
// the transcript editor, and hotwash:transcripts hands it to the AAR. The presentation window
// shows the recording notice while recording runs.
// A second test runs the real built-in Whisper path when whisper-tiny.en is already on this
// computer (TTX_WHISPER_MODELS_DIR, as written by the live test); it never downloads a model.
import { expect, test, type Page } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const SAMPLE = resolve('tests/fixtures/hotwash/hotwash-sample.wav')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
// Chromium's audio service sandbox cannot read a fake-capture file on every platform, so the
// mock-provider tests use the fake device's own tone; the real-model test plays the sample.
const FAKE_MIC = { TTX_FAKE_MEDIA: '1' }
const FAKE_MIC_SPEECH = { TTX_FAKE_MEDIA: '1', TTX_FAKE_AUDIO_FILE: SAMPLE }

async function scenarioProject(invoke: ReturnType<typeof invoker>) {
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-hotwash-'))
  const { path: projectPath } = await invoke<{ path: string }>('project:create', {
    parentDir,
    name: 'Hot Wash E2E',
  })
  const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
    projectPath,
    title: 'Flight to Nowhere',
  })
  await invoke('scenarios:save', {
    projectPath,
    scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
  })
  return { projectPath, scenarioId: empty.id }
}

/** Record about three seconds of the fake microphone from the Facilitate page. */
async function recordFromFacilitate(page: Page, projectPath: string, scenarioId: string) {
  await goTo(page, `#/p/${encodeURIComponent(projectPath)}/scenarios/${scenarioId}/facilitate`)
  const recorder = page.getByRole('region', { name: 'Hot wash recording' })
  await recorder.getByRole('button', { name: /Record hot wash/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Record the hot wash' })
  await expect(dialog.getByRole('button', { name: /Start recording/ })).toBeDisabled()
  await dialog.getByLabel(/Everyone present has been told/).check()
  await dialog.getByRole('button', { name: /Start recording/ }).click()
  await expect(recorder.getByText('Recording', { exact: true })).toBeVisible()
  await expect(page.locator('.fac-status')).toContainText('Recording the hot wash')
  await expect(recorder.getByRole('timer', { name: 'Recording time' })).toHaveText(
    /^0:00:0[3-9]$/,
    { timeout: 15_000 },
  )
  await recorder.getByRole('button', { name: 'Stop' }).click()
  await expect(page.locator('.fac-status')).toContainText('Recording stopped and saved')
}

test('hot wash: record from a fake microphone, transcribe, mark a quote for the AAR', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1', ...FAKE_MIC })
  const invoke = invoker(page)
  try {
    const { projectPath, scenarioId } = await scenarioProject(invoke)
    const req = { projectPath, scenarioId }
    await recordFromFacilitate(page, projectPath, scenarioId)

    const listing = await invoke<{
      recordings: { id: string; durationSec: number; status: string; consentConfirmedAt?: string }[]
    }>('hotwash:list', req)
    expect(listing.recordings).toHaveLength(1)
    const rec = listing.recordings[0]!
    expect(rec.status).toBe('ready')
    expect(rec.durationSec).toBeGreaterThan(2)
    expect(rec.consentConfirmedAt).toBeTruthy()

    // Transcribe from the Hot wash tab (the mock provider answers every 5 s).
    await page.getByRole('tab', { name: 'Hot wash' }).click()
    const recordings = page.getByRole('region', { name: 'Recordings' })
    await recordings.getByRole('button', { name: 'Transcribe', exact: true }).click()
    await recordings.getByRole('link', { name: 'Open transcript' }).click()

    const segments = page.getByRole('list', { name: 'Transcript segments' })
    await expect(segments.getByRole('listitem').first()).toContainText('Mock transcript at 0')
    await segments.getByRole('checkbox', { name: 'Quote for the AAR' }).first().check()
    await page.getByLabel('Objective').selectOption({ index: 1 })
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()

    type Cite = { citeKey: string; text: string; objectiveIds: string[] }
    await expect
      .poll(async () => (await invoke<Cite[]>('hotwash:transcripts', req))[0]?.objectiveIds.length)
      .toBe(1)
    const quotes = await invoke<Cite[]>('hotwash:transcripts', req)
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({ citeKey: 'T1', text: 'Mock transcript at 0 seconds.' })
    expect(quotes[0]!.objectiveIds).toHaveLength(1)
    // The audio is deleted once the transcript is saved (default).
    const after = await invoke<{ recordings: { audioPath?: string }[] }>('hotwash:list', req)
    expect(after.recordings[0]!.audioPath).toBeUndefined()
  } finally {
    await app.close()
  }
})

test('hot wash: the presentation window shows the recording notice', async () => {
  test.setTimeout(90_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1', ...FAKE_MIC })
  const invoke = invoker(page)
  try {
    const { projectPath, scenarioId } = await scenarioProject(invoke)
    const created = await invoke<{ id: string }>('injects:create', {
      projectPath,
      scenarioId,
      mselRowId: 'I-07',
      type: 'memo',
    })
    await invoke('facilitator:present', { projectPath, scenarioId, injectId: created.id })
    await expect
      .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
      .toBe(1)
    const present = app.windows().find((w) => w.url().includes('#/present/'))!
    await expect(present.getByText('This discussion is being recorded')).toHaveCount(0)
    await goTo(page, `#/p/${encodeURIComponent(projectPath)}/scenarios/${scenarioId}/facilitate`)
    const recorder = page.getByRole('region', { name: 'Hot wash recording' })
    await expect(recorder.getByRole('button', { name: /Record hot wash/ })).toBeVisible()
    await page.bringToFront()
    await page.keyboard.press('r')
    const dialog = page.getByRole('dialog', { name: 'Record the hot wash' })
    await dialog.getByLabel(/Everyone present has been told/).check()
    await dialog.getByRole('button', { name: /Start recording/ }).click()
    await expect(recorder.getByText('Recording', { exact: true })).toBeVisible()
    await expect(present.getByText('This discussion is being recorded')).toBeVisible()
    // The presentation window may never use the microphone itself.
    const denied = await present.evaluate(async () => {
      try {
        const s = await (
          globalThis as unknown as {
            navigator: { mediaDevices: { getUserMedia: (c: unknown) => Promise<unknown> } }
          }
        ).navigator.mediaDevices.getUserMedia({ audio: true })
        return !s
      } catch {
        return true
      }
    })
    expect(denied).toBe(true)
    await page.keyboard.press('Shift+R')
    await expect(page.locator('.fac-status')).toContainText('Recording stopped and saved')
    await expect(present.getByText('This discussion is being recorded')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

const MODELS = process.env.TTX_WHISPER_MODELS_DIR
const TINY = MODELS && join(MODELS, 'onnx-community', 'whisper-tiny.en')

test('hot wash: transcribes on this computer with whisper-tiny.en when it is already downloaded', async () => {
  test.skip(
    !TINY || !existsSync(join(TINY, 'onnx', 'encoder_model.onnx')),
    'whisper-tiny.en not cached',
  )
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'ttx-e2e-'))
  mkdirSync(join(userData, 'models', 'onnx-community'), { recursive: true })
  cpSync(TINY!, join(userData, 'models', 'onnx-community', 'whisper-tiny.en'), { recursive: true })
  const { app, page } = await launch(FAKE_MIC_SPEECH, { userData, args: ['--no-sandbox'] })
  const invoke = invoker(page)
  try {
    await invoke('settings:update', { patch: { onboardingComplete: true } }).catch(() => undefined)
    const { projectPath, scenarioId } = await scenarioProject(invoke)
    await recordFromFacilitate(page, projectPath, scenarioId)
    const { recordings } = await invoke<{ recordings: { id: string }[] }>('hotwash:list', {
      projectPath,
      scenarioId,
    })
    const { jobId } = await invoke<{ jobId: string }>('hotwash:transcribe', {
      projectPath,
      scenarioId,
      recordingId: recordings[0]!.id,
    })
    await expect
      .poll(async () => (await invoke<{ status: string }>('jobs:get', { jobId })).status, {
        timeout: 120_000,
      })
      .toBe('done')
    const { transcripts } = await invoke<{
      transcripts: { model: string; segments: { text: string }[] }[]
    }>('hotwash:list', { projectPath, scenarioId })
    expect(transcripts[0]!.model).toBe('whisper-tiny.en')
    const text = transcripts[0]!.segments
      .map((s) => s.text)
      .join(' ')
      .toLowerCase()
    expect(text).toMatch(/minutes|nobody|operations/)
  } finally {
    await app.close()
  }
})
