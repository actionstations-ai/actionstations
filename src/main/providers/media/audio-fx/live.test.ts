// LIVE=1: run every post-FX on real TTS output from a local mlx-audio server
// (LIVE_TTS_URL, default http://127.0.0.1:8765). Files go to LIVE_FX_OUT (default temp dir).
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyPostFx, decodeWav, toMp3, POST_FX, type PostFx } from './index'
import { gainToDb, peak, rms } from './dsp'

const LIVE = process.env.LIVE === '1'
const TTS_URL = process.env.LIVE_TTS_URL ?? 'http://127.0.0.1:8765'
const MODEL = process.env.LIVE_TTS_MODEL ?? 'mlx-community/VoxCPM2-8bit'
const TEXT =
  'Tower, Ops Two. We have smoke reported at baggage carousel four, requesting fire response to the lower level, over.'

async function speak(): Promise<Uint8Array> {
  const res = await fetch(`${TTS_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: TEXT, response_format: 'wav' }),
  })
  expect(res.ok).toBe(true)
  return new Uint8Array(await res.arrayBuffer())
}

describe.skipIf(!LIVE)('post-FX on real TTS', () => {
  it('renders every effect chain as WAV and MP3', { timeout: 300_000 }, async () => {
    const outDir = process.env.LIVE_FX_OUT ?? mkdtempSync(join(tmpdir(), 'ttx-fx-'))
    const dry = await speak()
    writeFileSync(join(outDir, 'dry.wav'), dry)
    const input = decodeWav(dry)
    const chains: PostFx[][] = [...POST_FX.map((f) => [f]), ['phone', 'terminal_ambience']]
    for (const fx of chains) {
      const started = performance.now()
      const wet = applyPostFx(dry, fx)
      const ms = Math.round(performance.now() - started)
      const mp3 = toMp3(wet)
      const name = fx.join('+')
      writeFileSync(join(outDir, `${name}.wav`), wet)
      writeFileSync(join(outDir, `${name}.mp3`), mp3)
      const out = decodeWav(wet)
      expect(out.samples.length / out.sampleRate).toBeCloseTo(
        input.samples.length / input.sampleRate,
        2,
      )
      expect(peak(out.samples)).toBeLessThanOrEqual(0.892)
      console.log(
        `[live] ${name}: ${ms} ms, ${(out.samples.length / out.sampleRate).toFixed(2)} s @ ${out.sampleRate} Hz, rms ${gainToDb(rms(out.samples)).toFixed(1)} dBFS, mp3 ${mp3.length} B`,
      )
    }
    console.log(`[live] post-FX files in ${outDir}`)
  })
})
