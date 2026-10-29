// Speech to text over POST /v1/audio/transcriptions (#425) for servers on this computer:
// whisper.cpp's whisper-server, speaches, mlx-audio. The recording goes up in 30 s windows
// (the same seek loop as the built-in worker), so progress, cancel and resume work the same and
// no request carries a whole hour of audio. Refuses any base URL that is not a loopback
// address before every request (spec 0425 FR-3).
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas'
import { readWavInfo, readWavWindow, pcm16WavHeader } from '../../../lib/wav-pcm'
import { toInt16 } from '../../media/audio-fx/wav'
import { joinUrl, requestJson } from '../../http'
import { assertLocalSpeechProvider } from '../../speech/local-only'
import { seekLoop } from '../../speech/windows'
import type { SpeechToTextProvider, TranscribeJob, TranscribeProgress } from '../../types'
import { VENDOR, apiBase, authHeaders } from './chat'

/** verbose_json from OpenAI-style servers; plain `text` when segments are missing. */
interface TranscriptionResponse {
  text?: string
  language?: string
  segments?: { start: number; end: number; text: string }[]
}

const WINDOW_TIMEOUT_MS = 10 * 60_000

/** One window as a small WAV file for the multipart upload. */
function windowWav(samples: Float32Array, sampleRate: number): Blob {
  const pcm = toInt16(samples)
  const header = pcm16WavHeader(pcm.byteLength, sampleRate)
  const bytes = new Uint8Array(header.byteLength + pcm.byteLength)
  bytes.set(header, 0)
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), header.byteLength)
  return new Blob([bytes], { type: 'audio/wav' })
}

export class OpenAiCompatibleTranscriber implements SpeechToTextProvider {
  readonly kind = 'openai-compatible' as const
  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | undefined,
  ) {}

  get id(): string {
    return this.config.id
  }

  private url(path: string): string {
    assertLocalSpeechProvider(this.config)
    return joinUrl(apiBase(this.config.baseUrl), path)
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await requestJson<{ data?: { id: string }[] }>(this.url('/models'), {
      vendor: VENDOR,
      headers: authHeaders(this.config, this.secret),
      retries: 0,
      ...(signal ? { signal } : {}),
    })
    return (res.data ?? [])
      .filter((m) => /whisper|parakeet|speech|stt|asr/i.test(m.id))
      .map((m) => ({ id: m.id, kind: 'speech' as const }))
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const n = (await this.listModels(signal)).length
      return { ok: true, message: `${n} speech model${n === 1 ? '' : 's'} listed` }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  }

  private async transcribeWindow(audio: Blob, job: TranscribeJob): Promise<TranscriptionResponse> {
    const form = new FormData()
    form.append('file', audio, 'window.wav')
    form.append('model', job.model ?? this.config.defaultModel ?? 'whisper-1')
    form.append('response_format', 'verbose_json')
    if (job.language) form.append('language', job.language)
    return requestJson<TranscriptionResponse>(this.url('/audio/transcriptions'), {
      vendor: VENDOR,
      method: 'POST',
      headers: authHeaders(this.config, this.secret),
      body: form,
      timeoutMs: WINDOW_TIMEOUT_MS,
      retries: 1,
      ...(job.signal ? { signal: job.signal } : {}),
    })
  }

  async transcribe(
    job: TranscribeJob,
    onWindow: (p: TranscribeProgress) => void | Promise<void>,
  ): Promise<{ language: string; model: string }> {
    assertLocalSpeechProvider(this.config)
    const info = await readWavInfo(job.audioPath)
    let language = job.language ?? ''
    const total = info.durationSec
    await seekLoop(
      total,
      job.fromSec ?? 0,
      async (w) => {
        const samples = await readWavWindow(job.audioPath, info, w.startSec, w.endSec)
        const res = await this.transcribeWindow(windowWav(samples, info.sampleRate), job)
        language ||= res.language ?? ''
        return res.segments?.length
          ? res.segments.map((s) => ({ text: s.text, startSec: s.start, endSec: s.end }))
          : [{ text: res.text ?? '', startSec: 0, endSec: null }]
      },
      (settled) =>
        onWindow({
          segments: settled.segments,
          doneUntilSec: Math.min(settled.nextStartSec, total),
          progress: total ? Math.min(1, settled.nextStartSec / total) : 1,
        }),
      () => job.signal?.throwIfAborted(),
    )
    return {
      language: language || 'unknown',
      model: job.model ?? this.config.defaultModel ?? 'whisper-1',
    }
  }
}
