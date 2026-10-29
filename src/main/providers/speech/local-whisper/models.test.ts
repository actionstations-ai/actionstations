// Built-in Whisper models (#425): every downloaded file is pinned, the default follows the
// computer's memory, and the provider refuses a model that is not downloaded.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const { WHISPER_MODELS, defaultWhisperModel, findWhisperModel, whisperFiles } =
  await import('./models')
const { LocalWhisperProvider, LOCAL_WHISPER_CONFIG, isWhisperDownloaded, pickWhisperModel } =
  await import('./provider')

const GB = 1024 ** 3

function fakeDownload(dir: string, name: string): void {
  const m = findWhisperModel(name)!
  for (const f of whisperFiles(m)) {
    const p = join(dir, m.id, f)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, '{}')
  }
}

describe('WHISPER_MODELS', () => {
  it('pins a commit and a sha256 for every file each model downloads', () => {
    for (const m of WHISPER_MODELS) {
      expect(m.pin.revision).toMatch(/^[0-9a-f]{40}$/)
      const files = whisperFiles(m)
      expect(files).toHaveLength(7)
      for (const f of files) expect(m.pin.sha256[f], `${m.name} ${f}`).toMatch(/^[0-9a-f]{64}$/)
      expect(Object.keys(m.pin.sha256).sort()).toEqual([...files].sort())
    }
  })

  it('picks quantized files to match each dtype', () => {
    expect(whisperFiles(findWhisperModel('whisper-base')!).slice(0, 2)).toEqual([
      'onnx/encoder_model.onnx',
      'onnx/decoder_model_merged_quantized.onnx',
    ])
    expect(whisperFiles(findWhisperModel('whisper-small')!)[0]).toBe(
      'onnx/encoder_model_quantized.onnx',
    )
  })

  it('defaults to whisper-small with 16 GB of memory and whisper-base below', () => {
    expect(defaultWhisperModel(8 * GB).name).toBe('whisper-base')
    expect(defaultWhisperModel(15.5 * GB).name).toBe('whisper-small')
    expect(defaultWhisperModel(64 * GB).name).toBe('whisper-small')
  })

  it('finds models by id or short name only', () => {
    expect(findWhisperModel('onnx-community/whisper-tiny.en')?.name).toBe('whisper-tiny.en')
    expect(findWhisperModel('whisper-tiny.en')?.multilingual).toBe(false)
    expect(findWhisperModel('../../etc')).toBeUndefined()
  })
})

describe('LocalWhisperProvider', () => {
  it('lists only downloaded models and reports health from them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-whisper-'))
    const p = new LocalWhisperProvider(LOCAL_WHISPER_CONFIG, () => dir)
    expect(await p.listModels()).toEqual([])
    expect((await p.health()).ok).toBe(false)
    fakeDownload(dir, 'whisper-base')
    expect(isWhisperDownloaded(findWhisperModel('whisper-base')!, dir)).toBe(true)
    expect((await p.listModels()).map((m) => [m.id, m.kind])).toEqual([['whisper-base', 'speech']])
    expect((await p.health()).ok).toBe(true)
  })

  it('uses a downloaded model when none is asked for', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-whisper-'))
    fakeDownload(dir, 'whisper-tiny.en')
    expect(pickWhisperModel(undefined, dir).name).toBe('whisper-tiny.en')
    expect(() => pickWhisperModel('whisper-huge', dir)).toThrow(/Unknown speech model/)
  })

  it('refuses to transcribe with a model that is not downloaded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-whisper-'))
    const runner = vi.fn()
    const p = new LocalWhisperProvider(LOCAL_WHISPER_CONFIG, () => dir, runner)
    await expect(
      p.transcribe({ audioPath: '/a.wav', model: 'whisper-base' }, () => undefined),
    ).rejects.toThrow(/not downloaded.*Settings › Speech to text/)
    expect(runner).not.toHaveBeenCalled()
  })

  it('hands the worker the model files, dtype and language', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-whisper-'))
    fakeDownload(dir, 'whisper-small')
    const transcribe = vi.fn(async () => ({ language: 'de', model: 'x' }))
    const p = new LocalWhisperProvider(
      LOCAL_WHISPER_CONFIG,
      () => dir,
      async () => ({
        transcribe,
        dispose: async () => undefined,
      }),
    )
    const out = await p.transcribe(
      { audioPath: '/a.wav', model: 'whisper-small', language: 'de', fromSec: 12 },
      () => undefined,
    )
    expect(out).toEqual({ language: 'de', model: 'whisper-small' })
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        modelsDir: dir,
        model: 'onnx-community/whisper-small',
        dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
        multilingual: true,
        language: 'de',
        fromSec: 12,
      }),
      expect.any(Function),
      undefined,
    )
  })
})
