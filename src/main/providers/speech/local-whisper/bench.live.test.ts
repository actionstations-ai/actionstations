// Speed check (LIVE=1 with TTX_WHISPER_BENCH_WAV=<16 kHz mono WAV>) for the ADR's NFR-4
// numbers: transcribes the file with each downloaded built-in model and prints the real-time
// factor and peak memory.
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const { WHISPER_MODELS } = await import('./models')
const { LocalWhisperProvider, LOCAL_WHISPER_CONFIG, downloadWhisperModel, isWhisperDownloaded } =
  await import('./provider')
const { readWavInfo } = await import('../../../lib/wav-pcm')

const WAV = process.env.TTX_WHISPER_BENCH_WAV
const DIR = process.env.TTX_WHISPER_MODELS_DIR
const NAMES = (process.env.TTX_WHISPER_BENCH_MODELS ?? 'whisper-tiny.en,whisper-base').split(',')

describe.skipIf(process.env.LIVE !== '1' || !WAV || !DIR)('Whisper speed (live)', () => {
  it('reports seconds of compute per minute of audio', async () => {
    const { durationSec } = await readWavInfo(WAV!)
    for (const m of WHISPER_MODELS.filter((x) => NAMES.includes(x.name))) {
      if (!isWhisperDownloaded(m, DIR)) await downloadWhisperModel(m, {}, DIR)
      const provider = new LocalWhisperProvider(LOCAL_WHISPER_CONFIG, () => DIR!)
      let peak = 0
      const started = Date.now()
      let words = 0
      await provider.transcribe({ audioPath: WAV!, model: m.name }, (w) => {
        peak = Math.max(peak, process.memoryUsage().rss)
        words += w.segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0)
        if (process.env.TTX_WHISPER_BENCH_DUMP)
          for (const s of w.segments) console.log(`  ${s.startSec}-${s.endSec} ${s.text}`)
      })
      const secs = (Date.now() - started) / 1000
      console.log(
        `[bench] ${m.name}: ${secs.toFixed(1)} s for ${durationSec.toFixed(0)} s audio ` +
          `(${((secs / durationSec) * 60).toFixed(1)} min per hour), ${words} words, ` +
          `peak RSS ${(peak / 1e9).toFixed(2)} GB`,
      )
      expect(words).toBeGreaterThan(0)
    }
  }, 1_800_000)
})
