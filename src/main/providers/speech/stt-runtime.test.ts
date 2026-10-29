// The worker's transcription loop with a fake Whisper pipeline (#425): window reads from the
// WAV, generate options per model, absolute timestamps, resume and the final reply.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pcm16WavHeader } from '../../lib/wav-pcm'
import type { WorkerReply } from './stt-protocol'
import { runTranscription, type AsrPipeline } from './stt-runtime'

const SAMPLE = resolve('tests/fixtures/hotwash/hotwash-sample.wav')
const JOB_MODEL = 'onnx-community/whisper-base'

function silentWav(seconds: number, rate = 16_000): string {
  const data = Buffer.alloc(seconds * rate * 2)
  const path = join(mkdtempSync(join(tmpdir(), 'ttx-stt-')), 'audio.wav')
  writeFileSync(path, Buffer.concat([pcm16WavHeader(data.length, rate), data]))
  return path
}

/** A pipeline that reports one 6 s sentence every 8 s of each window, and records its calls. */
function fakePipeline() {
  const calls: { samples: number; opts: Record<string, unknown> }[] = []
  const asr: AsrPipeline = async (audio, opts) => {
    calls.push({ samples: audio.length, opts })
    const sec = audio.length / 16_000
    const chunks = []
    for (let t = 0; t + 6 <= sec; t += 8)
      chunks.push({ text: ` Said at ${t}`, timestamp: [t, t + 6] as [number, number] })
    return { text: chunks.map((c) => c.text).join(''), chunks }
  }
  return { asr, calls }
}

const request = (audioPath: string, extra: Record<string, unknown> = {}) => ({
  id: 7,
  op: 'transcribe' as const,
  modelsDir: '/models',
  model: 'onnx-community/whisper-base',
  dtype: { encoder_model: 'fp32' as const, decoder_model_merged: 'q8' as const },
  multilingual: true,
  audioPath,
  ...extra,
})

describe('runTranscription', () => {
  it('transcribes the bundled sample in one window and ends with done', async () => {
    const { asr, calls } = fakePipeline()
    const replies: WorkerReply[] = []
    await runTranscription(request(SAMPLE), (r) => replies.push(r), { load: async () => asr })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.samples).toBeGreaterThan(4 * 16_000)
    expect(calls[0]!.opts).toEqual({ return_timestamps: true, language: 'en', task: 'transcribe' })
    expect(replies.map((r) => r.type)).toEqual(['window', 'done'])
    expect(replies[1]).toEqual({ id: 7, type: 'done', language: 'en', model: JOB_MODEL })
  })

  it('passes no language or task to English-only models', async () => {
    const { asr, calls } = fakePipeline()
    await runTranscription(
      request(SAMPLE, { multilingual: false, language: 'fr' }),
      () => undefined,
      {
        load: async () => asr,
      },
    )
    expect(calls[0]!.opts).toEqual({ return_timestamps: true })
  })

  it('walks a long recording in windows with absolute times and resumes from a point', async () => {
    const path = silentWav(70)
    const { asr } = fakePipeline()
    const windows: Extract<WorkerReply, { type: 'window' }>[] = []
    const collect = (r: WorkerReply) => r.type === 'window' && windows.push(r)
    await runTranscription(request(path), collect, { load: async () => asr })
    const starts = windows.flatMap((w) => w.segments.map((s) => s.startSec))
    expect(starts.slice(0, 4)).toEqual([0, 8, 16, 24])
    expect(windows.at(-1)!.progress).toBe(1)
    expect(windows.at(-1)!.doneUntilSec).toBe(70)
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1]!)

    const resumed: Extract<WorkerReply, { type: 'window' }>[] = []
    await runTranscription(
      request(path, { fromSec: 40 }),
      (r) => {
        if (r.type === 'window') resumed.push(r)
      },
      { load: async () => asr },
    )
    expect(resumed[0]!.segments[0]!.startSec).toBe(40)
  })

  it('stops between windows when cancelled', async () => {
    const { asr, calls } = fakePipeline()
    let windows = 0
    await expect(
      runTranscription(
        request(silentWav(120)),
        (r) => {
          if (r.type === 'window') windows++
        },
        { load: async () => asr, isCancelled: () => windows >= 1 },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(calls).toHaveLength(1)
  })

  it('refuses audio that is not 16 kHz mono', async () => {
    const { asr } = fakePipeline()
    await expect(
      runTranscription(request(silentWav(1, 44_100)), () => undefined, { load: async () => asr }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
