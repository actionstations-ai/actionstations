// Hot wash recorder in main (#425): chunks appended in order into audio.pcm, pause and resume,
// Stop finishing a valid WAV, recovery after a crash, the .gitignore line.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { resetSettingsCache } = await import('../settings/store')
const { ScenarioBrief } = await import('@shared/schemas')
const { readWavInfo, readWavWindow } = await import('../lib/wav-pcm')
const recorder = await import('./recorder')
const { readRecording, recordingFiles, updateRecording } = await import('./store')

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-hotwash-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'Recorder' })
  const s = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  return { root, scenarioId: s.id }
}

/** One second of a constant sample value. */
const second = (value: number) =>
  new Uint8Array(Int16Array.from({ length: 16_000 }, () => value).buffer.slice(0, 32_000))

describe('recorder', () => {
  it('records chunks in order and finishes a 16 kHz mono WAV on Stop', async () => {
    const { root, scenarioId } = await setup()
    const rec = await recorder.startRecording({
      root,
      scenarioId,
      source: 'microphone',
      title: 'Hot wash',
      exerciseMin: 95,
      consentConfirmedAt: new Date().toISOString(),
    })
    expect(rec.status).toBe('recording')
    expect(recorder.isActive(root, scenarioId, rec.id)).toBe(true)
    await recorder.appendChunk(root, scenarioId, rec.id, 0, second(1000))
    const r = await recorder.appendChunk(root, scenarioId, rec.id, 1, second(-1000))
    expect(r).toEqual({ durationSec: 2, full: false })
    const stopped = await recorder.stopRecording(root, scenarioId, rec.id)
    const files = await recordingFiles(root, scenarioId, rec.id)
    expect(stopped).toMatchObject({ status: 'ready', durationSec: 2, audioPath: files.wavRel })
    expect(stopped.exerciseMinAtStart).toBe(95)
    expect(existsSync(files.part)).toBe(false)
    const info = await readWavInfo(files.wav)
    expect(info).toMatchObject({ sampleRate: 16_000, channels: 1, dataOffset: 44, durationSec: 2 })
    const samples = await readWavWindow(files.wav, info, 1, 2)
    expect(samples[0]).toBeCloseTo(-1000 / 32768)
    expect(recorder.isActive(root, scenarioId, rec.id)).toBe(false)
  })

  it('refuses chunks out of order, oversized, or while paused', async () => {
    const { root, scenarioId } = await setup()
    const rec = await recorder.startRecording({ root, scenarioId, source: 'microphone' })
    expect(() => recorder.appendChunk(root, scenarioId, rec.id, 1, second(1))).toThrow(
      /out of order/,
    )
    expect(() => recorder.appendChunk(root, scenarioId, rec.id, 0, new Uint8Array(70_000))).toThrow(
      /wrong size/,
    )
    await recorder.pauseRecording(root, scenarioId, rec.id)
    expect(() => recorder.appendChunk(root, scenarioId, rec.id, 0, second(1))).toThrow(/paused/)
    const resumed = await recorder.resumeRecording(root, scenarioId, rec.id)
    expect(resumed.status).toBe('recording')
    expect(resumed.pauses).toHaveLength(1)
    expect(resumed.pauses[0]).toMatchObject({ atSec: 0 })
    expect(resumed.pauses[0]!.pausedAt).toBeDefined()
    expect(resumed.pauses[0]!.resumedAt).toBeDefined()
    await recorder.appendChunk(root, scenarioId, rec.id, 0, second(1))
    await recorder.stopRecording(root, scenarioId, rec.id)
    expect(() => recorder.appendChunk(root, scenarioId, rec.id, 1, second(1))).toThrow(
      /not running/,
    )
  })

  it('allows one microphone recording at a time', async () => {
    const { root, scenarioId } = await setup()
    const rec = await recorder.startRecording({ root, scenarioId, source: 'microphone' })
    await expect(
      recorder.startRecording({ root, scenarioId, source: 'microphone' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await recorder.stopRecording(root, scenarioId, rec.id)
  })

  it('recovers a recording left behind by a crash, up to the last bytes written', async () => {
    const { root, scenarioId } = await setup()
    // What a crash leaves: recording.json says "recording" and audio.pcm holds a header
    // placeholder plus 1.5 s of samples.
    const rec = await recorder.startRecording({ root, scenarioId, source: 'microphone' })
    await recorder.appendChunk(root, scenarioId, rec.id, 0, second(500))
    await recorder.stopRecording(root, scenarioId, rec.id)
    const files = await recordingFiles(root, scenarioId, rec.id)
    const wav = readFileSync(files.wav)
    writeFileSync(
      files.part,
      Buffer.concat([wav.subarray(0, 44).fill(0, 4, 8), wav.subarray(44), Buffer.alloc(16_000)]),
    )
    await updateRecording(root, scenarioId, rec.id, (r) => {
      const { audioPath: _a, ...rest } = r
      return { ...rest, status: 'recording' }
    })
    expect(await recorder.recoverRecordings(root, scenarioId)).toBe(1)
    const back = await readRecording(root, scenarioId, rec.id)
    expect(back.status).toBe('recovered')
    expect(back.durationSec).toBeCloseTo(1.5)
    expect(back.audioPath).toBe(files.wavRel)
    expect((await readWavInfo(files.wav)).durationSec).toBeCloseTo(1.5)
    expect(await recorder.recoverRecordings(root, scenarioId)).toBe(0)
  })

  it('leaves a running recording alone during recovery', async () => {
    const { root, scenarioId } = await setup()
    const rec = await recorder.startRecording({ root, scenarioId, source: 'microphone' })
    expect(await recorder.recoverRecordings(root, scenarioId)).toBe(0)
    await recorder.stopRecording(root, scenarioId, rec.id)
  })

  it('adds the audio line to an older project .gitignore once', async () => {
    const { root } = await setup()
    const path = join(root, '.gitignore')
    expect(readFileSync(path, 'utf8')).toContain(recorder.AUDIO_GITIGNORE_LINE)
    writeFileSync(path, 'index.sqlite')
    await recorder.ensureAudioGitignore(root)
    await recorder.ensureAudioGitignore(root)
    expect(readFileSync(path, 'utf8')).toBe(`index.sqlite\n${recorder.AUDIO_GITIGNORE_LINE}\n`)
  })
})
