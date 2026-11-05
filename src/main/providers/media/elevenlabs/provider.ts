import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { joinUrl, request, requestJson } from '../../http'
import type {
  MediaCapability,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
  VoiceInfo,
} from '../../types'
import { elapsed, numberOption, stringOption } from '../../text/common'
import { concatWav, mixUnder, pcmToWav, wavDurationSec } from '../../text/openai-compatible/wav'
import { friendlyElevenLabsError } from './errors'

const VENDOR = 'ElevenLabs'
const API = 'https://api.elevenlabs.io'
export const DEFAULT_MODEL = 'eleven_multilingual_v2'
/** Largest audio accepted in total, per job. */
const MAX_BYTES = 50 * 1024 * 1024
const RATES = new Set([22050, 24000, 44100])

interface Budget {
  bytes: number
}

export class ElevenLabsProvider implements MediaProvider {
  readonly kind = 'elevenlabs' as const
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

  private headers(): Record<string, string> {
    return { 'xi-api-key': this.secret ?? '' }
  }

  private get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return requestJson<T>(joinUrl(API, path), {
      headers: this.headers(),
      signal,
      timeoutMs: 15_000,
      retries: 1,
      vendor: VENDOR,
      secret: this.secret,
    })
  }

  /** The key check: the voice list is free. */
  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const res = await this.get<{ voices?: unknown[] }>('/v1/voices', signal)
      return { ok: true, latencyMs: elapsed(start), message: `${res.voices?.length ?? 0} voices` }
    } catch (err) {
      const message = friendlyElevenLabsError(err, 'the account').message
      return { ok: false, latencyMs: elapsed(start), message }
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const res = await this.get<
        { model_id: string; name?: string; can_do_text_to_speech?: boolean }[]
      >('/v1/models', signal)
      return res
        .filter((m) => m.can_do_text_to_speech)
        .map((m) => ({ id: m.model_id, label: m.name ?? m.model_id, kind: 'speech' as const }))
    } catch (err) {
      throw friendlyElevenLabsError(err, 'the account')
    }
  }

  async listVoices(signal?: AbortSignal): Promise<VoiceInfo[]> {
    try {
      const res = await this.get<{
        voices?: { voice_id: string; name?: string; description?: string | null }[]
      }>('/v1/voices', signal)
      return (res.voices ?? []).map((v) => ({
        id: v.voice_id,
        label: v.name ?? v.voice_id,
        ...(v.description ? { description: v.description } : {}),
      }))
    } catch (err) {
      throw friendlyElevenLabsError(err, 'the account')
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
    const model = job.model ?? this.config.defaultModel ?? DEFAULT_MODEL
    const rate = this.sampleRate()
    const budget: Budget = { bytes: 0 }
    const clips: Uint8Array[] = []
    for (const [i, line] of lines.entries()) {
      onProgress?.({
        progress: i / lines.length,
        message: `Voicing ${line.speaker} (${i + 1}/${lines.length})`,
      })
      const pcm = await this.speak(model, line, rate, budget, job.signal)
      clips.push(pcmToWav(pcm, rate))
    }
    let wav = concatWav(clips, numberOption(this.config, 'speakerGapSec') ?? 0.35)
    const soundNote = job.brief.soundNote?.trim()
    const withEffect = this.config.options.soundEffects === true && !!soundNote
    if (withEffect) {
      onProgress?.({ progress: 0.9, message: 'Adding sound effects' })
      const secs = wavDurationSec(wav)
      const effect = await this.soundEffect(soundNote, secs, rate, budget, job.signal)
      wav = mixUnder(wav, pcmToWav(effect, rate))
    }
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
          model: withEffect ? `${model} + sound effects` : model,
          prompt: lines.map((l) => `${l.speaker}: ${l.text}`).join('\n'),
        },
      },
    ]
  }

  private sampleRate(): number {
    const r = numberOption(this.config, 'sampleRate')
    return r && RATES.has(r) ? r : 44100
  }

  private voiceFor(speaker: string): string {
    const voices = this.config.options.voices
    if (voices && typeof voices === 'object') {
      const v = (voices as Record<string, unknown>)[speaker]
      if (typeof v === 'string' && v) return v
    }
    const fallback = stringOption(this.config, 'voice')
    if (!fallback)
      throw new AppError(
        'VALIDATION',
        `No ElevenLabs voice is chosen for ${speaker}. Pick one in Voices.`,
      )
    return fallback
  }

  private speak(
    model: string,
    line: { speaker: string; text: string },
    rate: number,
    budget: Budget,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const voice = encodeURIComponent(this.voiceFor(line.speaker))
    return this.post(
      `/v1/text-to-speech/${voice}?output_format=pcm_${rate}`,
      { text: line.text, model_id: model },
      line.speaker,
      budget,
      signal,
    )
  }

  private soundEffect(
    text: string,
    voiceSec: number,
    rate: number,
    budget: Budget,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const duration = Math.min(30, Math.max(0.5, Math.round(voiceSec * 10) / 10))
    return this.post(
      `/v1/sound-generation?output_format=pcm_${rate}`,
      { text, duration_seconds: duration },
      'the sound effect',
      budget,
      signal,
    )
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    what: string,
    budget: Budget,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    try {
      const res = await request(joinUrl(API, path), {
        method: 'POST',
        headers: this.headers(),
        body,
        signal,
        timeoutMs: numberOption(this.config, 'timeoutMs') ?? 120_000,
        retries: 2,
        vendor: VENDOR,
        secret: this.secret,
      })
      const bytes = new Uint8Array(await res.arrayBuffer())
      budget.bytes += bytes.length
      if (budget.bytes > MAX_BYTES)
        throw new AppError(
          'PROVIDER',
          'ElevenLabs returned more than 50 MB of audio; shorten the lines.',
        )
      if (bytes.length < 2)
        throw new AppError('PROVIDER', `ElevenLabs returned empty audio for ${what}`)
      return bytes
    } catch (err) {
      throw friendlyElevenLabsError(err, what)
    }
  }
}
