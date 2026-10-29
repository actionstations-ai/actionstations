// Mock speech to text (#425) for tests and e2e (TTX_MOCK_PROVIDERS=1): reads the recording's
// length and returns one fixed segment per 5 s, window by window like the real worker, so
// resume and progress behave the same.
import type { ProviderConfig } from '@shared/schemas'
import { readWavInfo } from '../../lib/wav-pcm'
import { seekLoop } from '../speech/windows'
import type { SpeechToTextProvider, TranscribeJob, TranscribeProgress } from '../types'

const SEGMENT_SEC = 5

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  readonly kind = 'mock' as const
  constructor(readonly config: ProviderConfig) {}
  get id(): string {
    return this.config.id
  }

  async listModels() {
    return [{ id: 'mock-whisper', kind: 'speech' as const }]
  }

  async health() {
    return { ok: true, latencyMs: 0, message: 'Mock provider' }
  }

  async transcribe(
    job: TranscribeJob,
    onWindow: (p: TranscribeProgress) => void | Promise<void>,
  ): Promise<{ language: string; model: string }> {
    const { durationSec } = await readWavInfo(job.audioPath)
    await seekLoop(
      durationSec,
      job.fromSec ?? 0,
      async (w) => {
        const out = []
        const first = Math.ceil((w.startSec - 1e-6) / SEGMENT_SEC) * SEGMENT_SEC
        for (let t = first; t < w.endSec; t += SEGMENT_SEC) {
          const end = Math.min(t + SEGMENT_SEC, w.endSec)
          out.push({
            text: `Mock transcript at ${t} seconds.`,
            startSec: t - w.startSec,
            endSec: end - w.startSec,
          })
        }
        return out
      },
      (settled) =>
        onWindow({
          segments: settled.segments,
          doneUntilSec: Math.min(settled.nextStartSec, durationSec),
          progress: durationSec ? Math.min(1, settled.nextStartSec / durationSec) : 1,
        }),
      () => job.signal?.throwIfAborted(),
    )
    return { language: job.language ?? 'en', model: job.model ?? 'mock-whisper' }
  }
}
