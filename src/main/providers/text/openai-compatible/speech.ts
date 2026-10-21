// Text-to-speech over POST /v1/audio/speech (mlx-audio, OpenAI). One request per voice line;
// the clips are joined into one WAV in job.outDir. voiceStyle is sent as `instructions`/`instruct`,
// which Qwen3-TTS VoiceDesign reads as the voice description.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { joinUrl, request } from '../../http'
import type {
  MediaCapability,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
} from '../../types'
import { elapsed, numberOption, stringOption } from '../common'
import { VENDOR, apiBase, authHeaders } from './chat'
import { concatWav, wavDurationSec } from './wav'

/** VoiceDesign models (Qwen3-TTS) reject requests without a voice description. */
const NEUTRAL_VOICE = 'A clear, neutral adult voice'
const isVoiceDesign = (model: string): boolean => /voicedesign/i.test(model)

interface VoiceLine {
  speaker: string
  voiceStyle?: string
  text: string
}

export class OpenAiCompatibleSpeechProvider implements MediaProvider {
  readonly kind = 'openai-compatible' as const
  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | undefined,
  ) {}

  get id(): string {
    return this.config.id
  }

  capabilities(): Set<MediaCapability> {
    return new Set<MediaCapability>(['audio'])
  }

  private get model(): string {
    const m = stringOption(this.config, 'ttsModel') ?? this.config.defaultModel
    if (!m)
      throw new AppError('VALIDATION', `Provider "${this.config.label}" has no TTS model selected`)
    return m
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await request(joinUrl(apiBase(this.config.baseUrl), '/models'), {
        headers: authHeaders(this.config, this.secret),
        signal,
        timeoutMs: 5_000,
        retries: 0,
        vendor: VENDOR,
        secret: this.secret,
      })
      return { ok: true, latencyMs: elapsed(start) }
    } catch (err) {
      return { ok: false, latencyMs: elapsed(start), message: (err as Error).message }
    }
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    if (job.kind !== 'audio')
      throw new AppError(
        'VALIDATION',
        `${this.config.label} only generates audio (got ${job.kind})`,
      )
    const lines = (job.brief.voiceLines ?? []).filter((l) => l.text.trim())
    if (!lines.length) throw new AppError('VALIDATION', 'Media brief has no voice lines to speak')
    const model = this.model
    const clips: Uint8Array[] = []
    for (const [i, line] of lines.entries()) {
      onProgress?.({
        progress: i / lines.length,
        message: `Voicing ${line.speaker} (${i + 1}/${lines.length})`,
      })
      clips.push(await this.speak(model, line, job.signal))
    }
    const wav = concatWav(clips, numberOption(this.config, 'speakerGapSec') ?? 0.35)
    await fs.mkdir(job.outDir, { recursive: true })
    const filePath = join(job.outDir, `${job.injectId}-tts-${Date.now()}.wav`)
    await fs.writeFile(filePath, wav)
    onProgress?.({ progress: 1, message: 'Audio ready' })
    return [
      {
        kind: 'audio',
        filePath,
        mimeType: 'audio/wav',
        durationSec: Math.round(wavDurationSec(wav) * 100) / 100,
        provenance: {
          provider: this.id,
          model,
          prompt: lines.map((l) => `${l.speaker}: ${l.text}`).join('\n'),
        },
      },
    ]
  }

  private async speak(model: string, line: VoiceLine, signal?: AbortSignal): Promise<Uint8Array> {
    const body: Record<string, unknown> = { model, input: line.text, response_format: 'wav' }
    const voice = this.voiceFor(line.speaker)
    if (voice) body.voice = voice
    const style = line.voiceStyle?.trim() || (isVoiceDesign(model) ? NEUTRAL_VOICE : '')
    // OpenAI names the field `instructions`; mlx-audio reads `instruct`. Send both.
    if (style) Object.assign(body, { instructions: style, instruct: style })
    const res = await request(joinUrl(apiBase(this.config.baseUrl), '/audio/speech'), {
      method: 'POST',
      headers: authHeaders(this.config, this.secret),
      body,
      signal,
      timeoutMs: numberOption(this.config, 'timeoutMs') ?? 300_000,
      vendor: VENDOR,
      secret: this.secret,
    })
    return readAudio(res, line.speaker)
  }

  /** options.voices maps speaker → voice id; options.voice is the default voice. */
  private voiceFor(speaker: string): string | undefined {
    const voices = this.config.options.voices
    if (voices && typeof voices === 'object') {
      const v = (voices as Record<string, unknown>)[speaker]
      if (typeof v === 'string' && v) return v
    }
    return stringOption(this.config, 'voice')
  }
}

async function readAudio(res: Response, speaker: string): Promise<Uint8Array> {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (err) {
    throw new AppError(
      'PROVIDER',
      `${VENDOR} closed the audio stream for ${speaker}: ${(err as Error).message}`,
    )
  }
  if (bytes.length < 44)
    throw new AppError('PROVIDER', `${VENDOR} returned empty audio for ${speaker}`)
  return bytes
}
