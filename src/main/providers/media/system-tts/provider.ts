// System-voice MediaProvider (ADR-0009 fallback, #215): speaks voice lines with the operating
// system's own engine (macOS `say`, Windows SAPI, espeak-ng / espeak) so audio injects work
// offline on any machine. Output is one 16-bit WAV in job.outDir, which then takes the same
// post-FX and MP3 path as every other TTS provider.
//
// Options: `engine` (say | sapi | espeak-ng | espeak) to force one; `voice` (or the default
// model) as the default voice; `voices` mapping speaker → voice; `speakerGapSec`; `timeoutMs`.
// Without a voice map, each speaker gets the next voice from the engine's pool so a two-party
// call has two distinguishable voices.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { numberOption, stringOption } from '../../text/common'
import { concatWav, wavDurationSec } from '../../text/openai-compatible/wav'
import type {
  MediaCapability,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
} from '../../types'
import { findEngine, systemDetectEnv, type DetectEnv, type FoundEngine } from './detect'
import { isEngineId, isSafeVoice, speakableText } from './engines'
import { runCommand, type Runner } from './run'

const LINE_TIMEOUT_MS = 60_000
const VOICES_TIMEOUT_MS = 10_000
/** A line longer than this is a drafting error, not a radio call. */
const MAX_LINE_CHARS = 4_000

export interface SystemVoiceDeps {
  run?: Runner
  detect?: DetectEnv
}

interface Line {
  speaker: string
  text: string
}

export class SystemVoiceProvider implements MediaProvider {
  readonly kind = 'system-tts' as const
  private readonly run: Runner
  private readonly detectEnv: DetectEnv | undefined
  private voices: Promise<string[]> | undefined

  constructor(
    readonly config: ProviderConfig,
    deps: SystemVoiceDeps = {},
  ) {
    this.run = deps.run ?? runCommand
    this.detectEnv = deps.detect
  }

  get id(): string {
    return this.config.id
  }

  capabilities(): Set<MediaCapability> {
    return new Set<MediaCapability>(['audio'])
  }

  /** The engine on this machine, honouring options.engine when it is installed. */
  engine(): FoundEngine | undefined {
    const preferred = this.config.options.engine
    return findEngine(
      this.detectEnv ?? systemDetectEnv(),
      isEngineId(preferred) ? preferred : undefined,
    )
  }

  private requireEngine(): FoundEngine {
    const found = this.engine()
    if (!found)
      throw new AppError(
        'VALIDATION',
        'No system voice is installed. On Linux install espeak-ng; macOS and Windows include one.',
      )
    return found
  }

  async health(): Promise<ProviderHealth> {
    const found = this.engine()
    if (!found)
      return {
        ok: false,
        message: 'No system voice found (macOS say, Windows SAPI, or espeak-ng / espeak).',
      }
    return {
      ok: true,
      message: `${found.engine.label} at ${found.path}`,
      details: { engine: found.engine.id, path: found.path },
    }
  }

  /** Installed voice names (cached per instance); empty when the engine cannot list them. */
  async listVoices(signal?: AbortSignal): Promise<string[]> {
    this.voices ??= (async () => {
      const { engine, path } = this.requireEngine()
      try {
        const res = await this.run(path, engine.listVoices.args, {
          ...(engine.listVoices.env ? { env: engine.listVoices.env } : {}),
          timeoutMs: VOICES_TIMEOUT_MS,
          signal,
        })
        return res.code === 0 ? engine.parseVoices(res.stdout) : []
      } catch {
        return []
      }
    })()
    return this.voices
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    if (job.kind !== 'audio')
      throw new AppError(
        'VALIDATION',
        `${this.config.label} only generates audio (got ${job.kind})`,
      )
    const lines = linesOf(job)
    const found = this.requireEngine()
    await fs.mkdir(job.outDir, { recursive: true })
    const voices = await this.voiceMap(lines, found, job.signal)
    const clips: Uint8Array[] = []
    for (const [i, line] of lines.entries()) {
      onProgress?.({
        progress: i / lines.length,
        message: `Voicing ${line.speaker} (${i + 1}/${lines.length})`,
      })
      clips.push(await this.speak(found, line, voices.get(line.speaker), job, i))
    }
    const wav = concatWav(clips, numberOption(this.config, 'speakerGapSec') ?? 0.35)
    const filePath = join(job.outDir, `${job.injectId}-tts-${Date.now()}.wav`)
    await fs.writeFile(filePath, wav)
    onProgress?.({ progress: 1, message: 'Audio ready' })
    const used = [...new Set(voices.values())]
    return [
      {
        kind: 'audio',
        filePath,
        mimeType: 'audio/wav',
        durationSec: Math.round(wavDurationSec(wav) * 100) / 100,
        provenance: {
          provider: this.id,
          model: used.length ? `${found.engine.id}: ${used.join(', ')}` : found.engine.id,
          prompt: lines.map((l) => `${l.speaker}: ${l.text}`).join('\n'),
        },
      },
    ]
  }

  /** Speaker → voice: the configured map first, then the default voice, then the pool. */
  private async voiceMap(
    lines: Line[],
    found: FoundEngine,
    signal?: AbortSignal,
  ): Promise<Map<string, string>> {
    const speakers = [...new Set(lines.map((l) => l.speaker))]
    const configured = configuredVoices(this.config)
    const base = safeVoice(stringOption(this.config, 'voice') ?? this.config.defaultModel)
    const out = new Map<string, string>()
    const unmapped = speakers.filter((s) => !configured[s])
    let pool: string[] = []
    if (unmapped.length > 1) pool = found.engine.speakerPool(await this.listVoices(signal), base)
    else if (base) pool = [base]
    for (const s of speakers) {
      const v = configured[s] ?? pool[unmapped.indexOf(s) % Math.max(pool.length, 1)]
      if (v) out.set(s, v)
    }
    return out
  }

  private async speak(
    found: FoundEngine,
    line: Line,
    voice: string | undefined,
    job: MediaJob,
    index: number,
  ): Promise<Uint8Array> {
    const stem = join(job.outDir, `${job.injectId}-line-${index}-${Date.now()}`)
    const textFile = `${stem}.txt`
    const outFile = `${stem}.wav`
    await fs.writeFile(textFile, line.text, 'utf8')
    try {
      const call = found.engine.speak({ textFile, outFile, voice })
      const res = await this.run(found.path, call.args, {
        ...(call.env ? { env: call.env } : {}),
        timeoutMs: numberOption(this.config, 'timeoutMs') ?? LINE_TIMEOUT_MS,
        signal: job.signal,
      })
      if (res.code !== 0)
        throw new AppError(
          'PROVIDER',
          `${found.engine.label} failed for ${line.speaker} (exit ${res.code}): ${res.stderr.trim().slice(0, 300)}`,
        )
      const bytes = new Uint8Array(await fs.readFile(outFile).catch(() => Buffer.alloc(0)))
      if (bytes.length < 44)
        throw new AppError('PROVIDER', `${found.engine.label} wrote no audio for ${line.speaker}`)
      return bytes
    } finally {
      await Promise.all([fs.rm(textFile, { force: true }), fs.rm(outFile, { force: true })])
    }
  }
}

function linesOf(job: MediaJob): Line[] {
  const lines = (job.brief.voiceLines ?? [])
    .map((l) => ({ speaker: l.speaker, text: speakableText(l.text).slice(0, MAX_LINE_CHARS) }))
    .filter((l) => l.text)
  if (!lines.length) throw new AppError('VALIDATION', 'Media brief has no voice lines to speak')
  return lines
}

function safeVoice(v: string | undefined): string | undefined {
  const t = v?.trim()
  if (!t) return undefined
  if (!isSafeVoice(t)) throw new AppError('VALIDATION', `"${t}" is not a valid voice name`)
  return t
}

function configuredVoices(config: ProviderConfig): Record<string, string> {
  const raw = config.options.voices
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [speaker, v] of Object.entries(raw as Record<string, unknown>)) {
    const voice = typeof v === 'string' ? safeVoice(v) : undefined
    if (voice) out[speaker] = voice
  }
  return out
}
