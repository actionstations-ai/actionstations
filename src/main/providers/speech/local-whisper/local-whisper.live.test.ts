// Live check (LIVE=1) for built-in transcription (#425): downloads whisper-tiny.en from its
// pinned commit with every file hash-checked (skipped when TTX_WHISPER_MODELS_DIR already
// holds it), then transcribes the bundled hot wash sample in-process and checks the words and
// the timestamps.
//   LIVE=1 pnpm exec vitest run src/main/providers/speech/local-whisper/local-whisper.live.test.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { TranscribeProgress } from '../../types'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const { findWhisperModel } = await import('./models')
const { LocalWhisperProvider, LOCAL_WHISPER_CONFIG, downloadWhisperModel, isWhisperDownloaded } =
  await import('./provider')

const LIVE = process.env.LIVE === '1'
const SAMPLE = resolve('tests/fixtures/hotwash/hotwash-sample.wav')

describe.skipIf(!LIVE)('local Whisper (live)', () => {
  it('downloads whisper-tiny.en with pinned hashes and transcribes the sample', async () => {
    const modelsDir =
      process.env.TTX_WHISPER_MODELS_DIR ?? mkdtempSync(join(tmpdir(), 'ttx-whisper-'))
    const tiny = findWhisperModel('whisper-tiny.en')!
    if (!isWhisperDownloaded(tiny, modelsDir)) await downloadWhisperModel(tiny, {}, modelsDir)
    expect(isWhisperDownloaded(tiny, modelsDir)).toBe(true)

    const provider = new LocalWhisperProvider(LOCAL_WHISPER_CONFIG, () => modelsDir)
    const windows: TranscribeProgress[] = []
    const started = Date.now()
    const result = await provider.transcribe(
      { audioPath: SAMPLE, model: 'whisper-tiny.en' },
      (w) => {
        windows.push(w)
      },
    )
    console.log(`[live] tiny.en: ${Date.now() - started} ms for the 4.5 s sample`)
    expect(result.model).toBe('whisper-tiny.en')
    const text = windows
      .flatMap((w) => w.segments.map((s) => s.text))
      .join(' ')
      .toLowerCase()
    expect(text).toContain('nobody knew who calls')
    expect(text).toContain('operations center')
    const first = windows[0]!.segments[0]!
    expect(first.startSec).toBeLessThan(0.5)
    expect(first.endSec).toBeGreaterThan(3.5)
    expect(windows.at(-1)!.progress).toBe(1)
  }, 300_000)
})
